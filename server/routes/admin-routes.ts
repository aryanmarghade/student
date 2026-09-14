import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import JSZip from 'jszip';
import { query, pool, logActivity, id } from '../db.js';
import { requireAuth, requireRole, hashPassword, AuthRequest, rateLimit } from '../auth.js';
import { processAiQuery } from '../ai-assistant.js';

const router = Router();
const root = process.cwd();
const uploadDir = path.join(root, 'uploads', 'marksheets');
fs.mkdirSync(uploadDir, { recursive: true });

// Multer for single-PDF marksheet upload
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${path.basename(file.originalname)}`),
  }),
  fileFilter: (_req, file, cb) => cb(null, file.mimetype === 'application/pdf' && file.originalname.toLowerCase().endsWith('.pdf')),
});

// Multer for bulk ZIP upload — stored in memory, processed in-flight
const zipUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype === 'application/zip' ||
      file.mimetype === 'application/x-zip-compressed' ||
      file.originalname.toLowerCase().endsWith('.zip');
    cb(null, ok);
  },
});

router.use(requireAuth, requireRole('admin'));
const withoutPassword = (row: any) => { const { password_hash, ...safe } = row; return safe; };

router.get('/overview', async (_req, res) => {
  const [counts, pass, trends, departments, activity] = await Promise.all([
    query(`SELECT (SELECT count(*)::int FROM students) AS "totalStudents", (SELECT count(*)::int FROM users WHERE role='teacher') AS "totalTeachers", (SELECT count(*)::int FROM classes) AS "totalClasses", (SELECT count(*)::int FROM semesters WHERE is_active) AS "activeSemesters"`),
    query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE marks_obtained / NULLIF(max_marks,0) >= .4)::int AS passed FROM marks WHERE exam_type IN ('Final','Midterm')`),
    query(`SELECT s.id AS "semesterId", s.name AS "semesterName", count(m)::int AS "evaluatedMarks", count(DISTINCT m.student_id)::int AS "activeStudents", round((count(*) FILTER (WHERE m.marks_obtained / NULLIF(m.max_marks,0) >= .4)::numeric / NULLIF(count(*),0))*100,1) AS "passRate" FROM semesters s JOIN marks m ON m.semester_id=s.id GROUP BY s.id ORDER BY s.semester_number`),
    query(`SELECT d.id,d.name,d.code,count(DISTINCT st.id)::int AS "studentCount",count(DISTINCT c.id)::int AS "classCount" FROM departments d LEFT JOIN students st ON st.department_id=d.id LEFT JOIN classes c ON c.department_id=d.id GROUP BY d.id ORDER BY d.name`),
    query(`SELECT a.*, coalesce(u.full_name,'System') AS "userName" FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 10`),
  ]);
  const c = counts.rows[0]; const p = pass.rows[0] as any;
  res.json({ ...c, overallPassRate: Number(p.total) ? Number((p.passed / p.total * 100).toFixed(1)) : null, semesterTrends: trends.rows, departmentStats: departments.rows, recentActivity: activity.rows });
});

router.get('/audit-logs', async (_req, res) => res.json((await query(`SELECT a.*,coalesce(u.full_name,'System') AS "userName" FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC`)).rows));

router.get('/users', async (req, res) => {
  const params: any[] = []; const filters: string[] = [];
  if (req.query.role) { params.push(req.query.role); filters.push(`u.role=$${params.length}`); }
  if (req.query.search) { params.push(`%${String(req.query.search).toLowerCase()}%`); filters.push(`(lower(u.full_name) LIKE $${params.length} OR lower(u.email) LIKE $${params.length} OR lower(coalesce(s.roll_number,'')) LIKE $${params.length})`); }
  const rows = (await query(`SELECT u.id,u.email,u.role,u.full_name,u.is_active,u.must_reset_password,u.created_at,s.id AS student_id,s.roll_number,s.class_id, c.name AS class_name,d.name AS department_name,s.profile_strength,(SELECT count(*)::int FROM teacher_class_assignments a WHERE a.teacher_user_id=u.id AND a.status='active') AS "activeAssignmentsCount" FROM users u LEFT JOIN students s ON s.user_id=u.id LEFT JOIN classes c ON c.id=s.class_id LEFT JOIN departments d ON d.id=s.department_id ${filters.length ? 'WHERE ' + filters.join(' AND ') : ''} ORDER BY u.full_name`, params)).rows;
  res.json(rows);
});

router.post('/users', async (req: AuthRequest, res) => {
  const { email, full_name, role, roll_number, class_id, department_id } = req.body;
  if (!email || !full_name || !role) return res.status(400).json({ error: 'Email, full name, and role are required.' });
  const normalized = String(email).trim().toLowerCase();
  if ((await query('SELECT 1 FROM users WHERE lower(email)=$1', [normalized])).rowCount) return res.status(409).json({ error: 'An account with this institutional email already exists.' });
  const tempPassword = `VA-${crypto.randomBytes(4).toString('hex').toUpperCase()}`, userId = id('usr');
  const passwordHash = await hashPassword(tempPassword);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO users (id,email,password_hash,role,full_name,is_active,must_reset_password) VALUES ($1,$2,$3,$4,$5,TRUE,TRUE)', [userId, normalized, passwordHash, role, String(full_name).trim()]);
    let student: any;
    if (role === 'student') {
      const cls = class_id ? (await client.query('SELECT id,department_id FROM classes WHERE id=$1', [class_id])).rows[0] : (await client.query('SELECT id,department_id FROM classes ORDER BY id LIMIT 1')).rows[0];
      student = { id: id('std'), user_id: userId, roll_number: String(roll_number || `VA${Date.now()}`).toUpperCase(), class_id: cls?.id || null, department_id: department_id || cls?.department_id || null, profile_strength: 20 };
      await client.query('INSERT INTO students (id,user_id,roll_number,class_id,department_id,profile_strength) VALUES ($1,$2,$3,$4,$5,$6)', [student.id, userId, student.roll_number, student.class_id, student.department_id, 20]);
    }
    await client.query('COMMIT');
    await logActivity(req.user!.id, 'USER_CREATE', 'USER', userId, `Created ${role} account for ${full_name}.`);
    res.status(201).json({ message: 'User account created successfully.', tempPassword, user: { id: userId, email: normalized, role, full_name, must_reset_password: true, ...(student ? { student_id: student.id, roll_number: student.roll_number } : {}) }, student });
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
});

router.patch('/users/:id/status', async (req: AuthRequest, res) => {
  if (req.params.id === req.user!.id) return res.status(400).json({ error: 'You cannot deactivate your own master administrator account.' });
  const r = await query<{ is_active: boolean; full_name: string }>('UPDATE users SET is_active=NOT is_active WHERE id=$1 RETURNING is_active,full_name', [req.params.id]);
  if (!r.rowCount) return res.status(404).json({ error: 'User not found.' });
  await logActivity(req.user!.id, 'USER_STATUS_CHANGE', 'USER', req.params.id, `Changed account status for ${r.rows[0].full_name}.`);
  res.json({ message: 'Account status updated successfully.', is_active: r.rows[0].is_active });
});

router.post('/users/:id/reset-password', async (req: AuthRequest, res) => {
  const tempPassword = `VA-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const r = await query<{ full_name: string }>('UPDATE users SET password_hash=$1,must_reset_password=TRUE WHERE id=$2 RETURNING full_name', [await hashPassword(tempPassword), req.params.id]);
  if (!r.rowCount) return res.status(404).json({ error: 'User not found.' });
  await logActivity(req.user!.id, 'ADMIN_PASSWORD_RESET', 'USER', req.params.id, `Reset password for ${r.rows[0].full_name}.`);
  res.json({ message: `Password reset successfully for ${r.rows[0].full_name}.`, tempPassword });
});

router.post('/users/bulk-import', async (req: AuthRequest, res) => {
  const { csvText, role } = req.body;
  if (!csvText || !role) return res.status(400).json({ error: 'CSV text content and target role are required.' });
  const lines = String(csvText).split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const headers = lines.shift()!.split(',').map(x => x.trim().toLowerCase());
  const ei = headers.findIndex(x => x.includes('email')), ni = headers.findIndex(x => x.includes('name')), ri = headers.findIndex(x => x.includes('roll'));
  const successRows: any[] = [], failedRows: any[] = [];
  for (const [index, line] of lines.entries()) {
    const cols = line.split(',').map(x => x.trim());
    const email = cols[ei], name = cols[ni];
    if (!email || !name) { failedRows.push({ rowNumber: index + 2, data: line, reason: 'Email and name are required' }); continue; }
    if ((await query('SELECT 1 FROM users WHERE lower(email)=$1', [email.toLowerCase()])).rowCount) { failedRows.push({ rowNumber: index + 2, data: line, reason: 'Email already registered' }); continue; }
    const password = `VA-${crypto.randomBytes(4).toString('hex').toUpperCase()}`, uid = id('usr');
    await query('INSERT INTO users (id,email,password_hash,role,full_name,is_active,must_reset_password) VALUES ($1,$2,$3,$4,$5,TRUE,TRUE)', [uid, email.toLowerCase(), await hashPassword(password), role, name]);
    if (role === 'student') { const cls = (await query<any>('SELECT id,department_id FROM classes ORDER BY id LIMIT 1')).rows[0]; await query('INSERT INTO students (id,user_id,roll_number,class_id,department_id,profile_strength) VALUES ($1,$2,$3,$4,$5,20)', [id('std'), uid, (ri >= 0 ? cols[ri] : `VA${Date.now()}`).toUpperCase(), cls?.id || null, cls?.department_id || null]); }
    successRows.push({ email, name, tempPassword: password });
  }
  res.json({ summary: { totalRows: lines.length, successfulCount: successRows.length, failedCount: failedRows.length }, successRows, failedRows });
});

router.get('/classes', async (_req, res) => res.json((await query(`SELECT c.*,d.name AS "departmentName",d.code AS "departmentCode",count(DISTINCT s.id)::int AS "studentCount",count(DISTINCT a.id) FILTER (WHERE a.status='active')::int AS "activeTeacherCount" FROM classes c LEFT JOIN departments d ON d.id=c.department_id LEFT JOIN students s ON s.class_id=c.id LEFT JOIN teacher_class_assignments a ON a.class_id=c.id GROUP BY c.id,d.name,d.code ORDER BY c.name`)).rows));
router.post('/classes', async (req: AuthRequest, res) => {
  const { name, department_id, year, section } = req.body;
  if (!name || !department_id || !year || !section) return res.status(400).json({ error: 'Class name, department, year, and section are all required.' });
  const c = { id: id('cls'), name: String(name).trim().toUpperCase(), department_id, academic_year_id: (await query<any>('SELECT id FROM academic_years WHERE is_current ORDER BY id LIMIT 1')).rows[0]?.id, year: Number(year), section: String(section).trim().toUpperCase() };
  try { await query('INSERT INTO classes (id,name,department_id,academic_year_id,year,section) VALUES ($1,$2,$3,$4,$5,$6)', [c.id, c.name, c.department_id, c.academic_year_id, c.year, c.section]); }
  catch (e: any) { if (e.code === '23505') return res.status(409).json({ error: 'A class with this designation already exists.' }); throw e; }
  await logActivity(req.user!.id, 'CLASS_CREATE', 'CLASS', c.id, `Created class ${c.name}.`);
  res.status(201).json({ message: 'Class created successfully.', class: c });
});
router.delete('/classes/:id', async (req: AuthRequest, res) => {
  const n = await query<{ name: string }>('SELECT name FROM classes WHERE id=$1', [req.params.id]);
  if (!n.rowCount) return res.status(404).json({ error: 'Class not found.' });
  const deps = (await query<{ count: string }>('SELECT count(*)::int FROM students WHERE class_id=$1 UNION ALL SELECT count(*)::int FROM teacher_class_assignments WHERE class_id=$1', [req.params.id])).rows;
  if (deps.some(x => Number(x.count) > 0)) return res.status(409).json({ error: 'Cannot delete a class with enrolled students or assignments.' });
  await query('DELETE FROM classes WHERE id=$1', [req.params.id]);
  res.json({ message: `Class ${n.rows[0].name} deleted successfully.` });
});
router.get('/departments', async (_req, res) => res.json((await query('SELECT id,name,code FROM departments ORDER BY name')).rows));
router.get('/semesters', async (_req, res) => res.json((await query('SELECT * FROM semesters ORDER BY semester_number')).rows));
router.get('/subjects', async (_req, res) => res.json((await query(`SELECT s.*,d.name AS "departmentName",count(m.id)::int AS "marksCount" FROM subjects s LEFT JOIN departments d ON d.id=s.department_id LEFT JOIN marks m ON m.subject_id=s.id GROUP BY s.id,d.name ORDER BY s.code`)).rows));
router.post('/subjects', async (req: AuthRequest, res) => {
  const { name, code, department_id, max_marks } = req.body;
  if (!name || !code || !department_id) return res.status(400).json({ error: 'Subject name, course code, and department are required.' });
  const s = { id: id('sbj'), name: String(name).trim(), code: String(code).trim().toUpperCase(), department_id, max_marks: Number(max_marks) || 100 };
  try { await query('INSERT INTO subjects (id,name,code,department_id,max_marks) VALUES ($1,$2,$3,$4,$5)', [s.id, s.name, s.code, s.department_id, s.max_marks]); }
  catch (e: any) { if (e.code === '23505') return res.status(409).json({ error: 'A subject with this course code already exists.' }); throw e; }
  res.status(201).json({ message: 'Subject created successfully.', subject: s });
});
router.delete('/subjects/:id', async (req, res) => {
  try { await query('DELETE FROM subjects WHERE id=$1', [req.params.id]); res.json({ message: 'Subject deleted successfully.' }); }
  catch (e: any) { if (e.code === '23503') return res.status(409).json({ error: 'Cannot delete a subject referenced by assignments or marks.' }); throw e; }
});

router.get('/teacher-assignments', async (_req, res) => {
  const rows = (await query(`SELECT a.*,u.full_name AS "teacherName",u.email AS "teacherEmail",c.name AS "className",s.name AS "subjectName",s.code AS "subjectCode",sem.name AS "semesterName" FROM teacher_class_assignments a JOIN users u ON u.id=a.teacher_user_id JOIN classes c ON c.id=a.class_id JOIN subjects s ON s.id=a.subject_id JOIN semesters sem ON sem.id=a.semester_id ORDER BY a.created_at DESC`)).rows;
  res.json({ all: rows, active: rows.filter(x => x.status === 'active'), past: rows.filter(x => x.status === 'past') });
});
router.post('/teacher-assignments', async (req: AuthRequest, res) => {
  const { teacher_user_id, class_id, subject_id, semester_id } = req.body;
  if (!teacher_user_id || !class_id || !subject_id || !semester_id) return res.status(400).json({ error: 'Faculty member, class, subject, and semester are required.' });
  const a = { id: id('tca'), teacher_user_id, class_id, subject_id, semester_id, status: 'active', created_at: new Date().toISOString() };
  try { await query('INSERT INTO teacher_class_assignments (id,teacher_user_id,class_id,subject_id,semester_id,status) VALUES ($1,$2,$3,$4,$5,$6)', [a.id, a.teacher_user_id, a.class_id, a.subject_id, a.semester_id, a.status]); }
  catch (e: any) { if (e.code === '23505') return res.status(409).json({ error: 'This teacher is already actively assigned to this class and subject for this semester.' }); throw e; }
  res.status(201).json({ message: 'Teacher assigned successfully.', assignment: a });
});
router.patch('/teacher-assignments/:id/archive', async (req: AuthRequest, res) => {
  const r = await query('UPDATE teacher_class_assignments SET status=\'past\' WHERE id=$1 RETURNING *', [req.params.id]);
  if (!r.rowCount) return res.status(404).json({ error: 'Assignment record not found.' });
  res.json({ message: 'Assignment moved to past history.', assignment: r.rows[0] });
});
router.post('/start-new-semester', async (req: AuthRequest, res) => {
  const num = Number(req.body.semesterNumber) || ((await query('SELECT count(*)::int AS count FROM semesters')).rows[0].count + 1);
  const name = String(req.body.semesterName || `Semester ${num}`).trim();
  const year = (await query<any>('SELECT id FROM academic_years WHERE is_current LIMIT 1')).rows[0]?.id;
  const sem = { id: id('sem'), academic_year_id: year, semester_number: num, name, is_active: true };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE semesters SET is_active=FALSE');
    await client.query('INSERT INTO semesters (id,academic_year_id,semester_number,name,is_active) VALUES ($1,$2,$3,$4,TRUE)', [sem.id, year, num, name]);
    const r = await client.query("UPDATE teacher_class_assignments SET status='past' WHERE status='active'");
    await client.query('COMMIT');
    res.json({ message: `New semester "${name}" activated.`, newSemester: sem, archivedCount: r.rowCount });
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
});

// ── Marksheets ────────────────────────────────────────────────────────────────

router.get('/marksheets', async (_req, res) => res.json((await query(`SELECT m.*,u.full_name AS "studentName",s.roll_number AS "rollNumber",sem.name AS "semesterName" FROM marksheets m JOIN students s ON s.id=m.student_id JOIN users u ON u.id=s.user_id JOIN semesters sem ON sem.id=m.semester_id ORDER BY m.created_at DESC`)).rows));

/** Single PDF upload for one student */
router.post('/marksheets/upload', upload.single('file'), async (req: AuthRequest, res) => {
  if (!req.file) return res.status(400).json({ error: 'Please upload a PDF file.' });
  const bytes = fs.readFileSync(req.file.path);
  if (!bytes.subarray(0, 5).toString('ascii').startsWith('%PDF-')) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'The uploaded file is not a valid PDF.' });
  }
  const { student_id, semester_id, sgpa, cgpa } = req.body;
  const student = (await query<any>('SELECT id FROM students WHERE id=$1', [student_id])).rows[0];
  if (!student) { fs.unlinkSync(req.file.path); return res.status(404).json({ error: 'Student record not found.' }); }
  const fileUrl = `/uploads/marksheets/${req.file.filename}`;
  const record = { id: id('ms'), student_id, semester_id, file_url: fileUrl, file_name: req.file.originalname, sgpa: Number(sgpa) || 0, cgpa: Number(cgpa) || 0, uploaded_by: req.user!.id, created_at: new Date().toISOString() };
  await query('INSERT INTO marksheets (id,student_id,semester_id,file_url,file_name,sgpa,cgpa,uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [record.id, record.student_id, record.semester_id, record.file_url, record.file_name, record.sgpa, record.cgpa, record.uploaded_by]);
  await logActivity(req.user!.id, 'MARKSHEET_UPLOAD', 'MARKSHEET', record.id, `Uploaded official marksheet for ${student_id}.`);
  res.json({ message: 'Official student marksheet recorded successfully.', marksheet: record });
});

/**
 * Bulk ZIP upload — processes a ZIP archive of PDF marksheets.
 * Filename convention: <ROLL_NUMBER>.pdf (case-insensitive)
 * Example: QA-S1-001.pdf → student with roll_number = QA-S1-001
 * Body: file (ZIP), semester_id
 */
router.post('/marksheets/bulk-zip', zipUpload.single('file'), async (req: AuthRequest, res) => {
  if (!req.file) return res.status(400).json({ error: 'Please upload a ZIP archive.' });
  const { semester_id } = req.body;
  if (!semester_id) return res.status(400).json({ error: 'semester_id is required.' });

  let zip: JSZip;
  try { zip = await JSZip.loadAsync(req.file.buffer); }
  catch { return res.status(400).json({ error: 'Failed to open ZIP archive. Ensure it is a valid ZIP file.' }); }

  const allStudents = (await query<any>('SELECT s.id, s.roll_number, u.full_name FROM students s JOIN users u ON u.id=s.user_id')).rows;
  const studentByRoll = new Map(allStudents.map((s: any) => [s.roll_number.toUpperCase(), s]));
  const results: { file: string; status: 'saved' | 'skipped' | 'error'; reason?: string }[] = [];
  let savedCount = 0;

  for (const [filename, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) continue;
    const basename = path.basename(filename);
    if (!basename.toLowerCase().endsWith('.pdf')) {
      results.push({ file: basename, status: 'skipped', reason: 'Not a PDF file' });
      continue;
    }
    const rollNumber = path.basename(basename, path.extname(basename)).toUpperCase();
    const student = studentByRoll.get(rollNumber);
    if (!student) {
      results.push({ file: basename, status: 'skipped', reason: `No student found with roll number "${rollNumber}"` });
      continue;
    }
    let pdfBuffer: Buffer;
    try { pdfBuffer = Buffer.from(await zipEntry.async('arraybuffer')); }
    catch { results.push({ file: basename, status: 'error', reason: 'Failed to read file from ZIP' }); continue; }
    if (!pdfBuffer.subarray(0, 5).toString('ascii').startsWith('%PDF-')) {
      results.push({ file: basename, status: 'error', reason: 'File is not a valid PDF' });
      continue;
    }
    const serverFilename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${basename}`;
    const filePath = path.join(uploadDir, serverFilename);
    const duplicate = (await query(
      'SELECT 1 FROM marksheets WHERE student_id=$1 AND semester_id=$2 AND file_name=$3 LIMIT 1',
      [student.id, semester_id, basename],
    )).rowCount;
    if (duplicate) {
      results.push({ file: basename, status: 'skipped', reason: 'Duplicate marksheet for this student and semester' });
      continue;
    }
    try { fs.writeFileSync(filePath, pdfBuffer); }
    catch { results.push({ file: basename, status: 'error', reason: 'Failed to save file to disk' }); continue; }
    const fileUrl = `/uploads/marksheets/${serverFilename}`;
    const marksheetId = id('ms');
    await query('INSERT INTO marksheets (id,student_id,semester_id,file_url,file_name,sgpa,cgpa,uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [marksheetId, student.id, semester_id, fileUrl, basename, 0, 0, req.user!.id]);
    await logActivity(req.user!.id, 'MARKSHEET_BULK_ZIP', 'MARKSHEET', marksheetId, `Bulk ZIP: marksheet for ${rollNumber} (${student.full_name}).`);
    results.push({ file: basename, status: 'saved' });
    savedCount++;
  }

  res.json({
    message: `Bulk ZIP processed. ${savedCount} marksheet(s) saved.`,
    summary: { savedCount, skippedCount: results.filter(r => r.status === 'skipped').length, errorCount: results.filter(r => r.status === 'error').length },
    details: results,
  });
});

router.post('/marksheets', async (req: AuthRequest, res) => {
  const { student_id, semester_id, sgpa, cgpa, file_name, file_url } = req.body;
  if (!student_id || !semester_id || !String(file_name || '').toLowerCase().endsWith('.pdf')) return res.status(400).json({ error: 'Official marksheets must be uploaded as a PDF file.' });
  const record = { id: id('ms'), student_id, semester_id, file_url: file_url || '', file_name, sgpa: Number(sgpa) || 0, cgpa: Number(cgpa) || 0, uploaded_by: req.user!.id, created_at: new Date().toISOString() };
  await query('INSERT INTO marksheets (id,student_id,semester_id,file_url,file_name,sgpa,cgpa,uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', Object.values(record));
  res.status(201).json({ message: 'Marksheet uploaded successfully.', marksheet: record });
});

router.get('/notifications', async (_req, res) => res.json((await query(`SELECT n.*,u.full_name AS "creatorName",c.name AS "targetClassName",count(nr.id)::int AS "readCount" FROM notifications n LEFT JOIN users u ON u.id=n.created_by LEFT JOIN classes c ON c.id=n.target_class_id LEFT JOIN notification_reads nr ON nr.notification_id=n.id GROUP BY n.id,u.full_name,c.name ORDER BY n.created_at DESC`)).rows));
router.post('/notifications', async (req: AuthRequest, res) => {
  const { title, body, target_role, target_class_id, file_url } = req.body;
  if (!title || !body || !target_role) return res.status(400).json({ error: 'Title, body, and audience are required.' });
  const n = { id: id('notif'), title: String(title).trim(), body: String(body).trim(), target_role, target_class_id: target_role === 'class' ? target_class_id : null, file_url: file_url || null, created_by: req.user!.id, created_at: new Date().toISOString() };
  await query('INSERT INTO notifications (id,title,body,target_role,target_class_id,file_url,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)', Object.values(n));
  res.status(201).json({ message: 'Notification published successfully.', notification: n });
});
router.delete('/notifications/:id', async (req, res) => { await query('DELETE FROM notifications WHERE id=$1', [req.params.id]); res.json({ message: 'Notification deleted successfully.' }); });
router.get('/events', async (_req, res) => res.json((await query('SELECT * FROM events ORDER BY event_date DESC')).rows));
router.post('/events', async (req: AuthRequest, res) => {
  const b = req.body;
  if (!b.name || !b.description || !b.organizer || !b.event_date || !b.location) return res.status(400).json({ error: 'Name, description, organizer, event date, and location are required.' });
  const e = { id: id('evt'), name: String(b.name).trim(), description: String(b.description).trim(), organizer: String(b.organizer).trim(), event_date: b.event_date, registration_deadline: b.registration_deadline || null, location: String(b.location).trim(), registration_link: b.registration_link || '', banner_url: b.banner_url || '', eligibility: b.eligibility || 'All Students', status: b.status || 'upcoming', created_by: req.user!.id };
  await query('INSERT INTO events (id,name,description,organizer,event_date,registration_deadline,location,registration_link,banner_url,eligibility,status,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', Object.values(e));
  res.status(201).json({ message: 'Event created successfully', event: e });
});
router.delete('/events/:id', async (req, res) => { await query('DELETE FROM events WHERE id=$1', [req.params.id]); res.json({ message: 'Event removed successfully' }); });
router.get('/analytics', async (_req, res) => {
  const marks = (await query<any>(`SELECT marks_obtained,max_marks,exam_type,department_id FROM marks m JOIN students s ON s.id=m.student_id`)).rows;
  const grades = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const m of marks) { const p = m.marks_obtained / m.max_marks * 100; grades[p >= 85 ? 'A' : p >= 70 ? 'B' : p >= 55 ? 'C' : p >= 40 ? 'D' : 'F']++; }
  res.json({ totalEvaluations: marks.length, gradeDistribution: grades, examAverages: [], deptPerformance: [] });
});
router.post('/ai-query', rateLimit(25, 60000, 'admin-ai'), async (req: AuthRequest, res) => res.json(await processAiQuery(req.user!, String(req.body.query || ''))));
router.post('/dev-seed', (_req, res) => res.status(410).json({ error: 'Runtime reset/seed endpoints are disabled; database initialization is idempotent and never destructive.' }));
router.post('/reset-to-fresh', (_req, res) => res.status(410).json({ error: 'Runtime database reset is disabled to protect persistent PostgreSQL data.' }));
export default router;
