import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { query, id, logActivity } from '../db.js';
import { requireAuth, requireRole, AuthRequest, rateLimit } from '../auth.js';
import { parseResumeContent, calculateProfileStrength } from '../resume-parser.js';
import { processAiQuery } from '../ai-assistant.js';

const router = Router();
router.use(requireAuth, requireRole('student'));

const marksheetDir = path.join(process.cwd(), 'uploads', 'marksheets');
const studentDocDir = path.join(process.cwd(), 'uploads', 'student-docs');
fs.mkdirSync(studentDocDir, { recursive: true });

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

const docUpload = multer({
  storage: multer.diskStorage({
    destination: studentDocDir,
    filename: (_req, file, cb) =>
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: PDF, images, DOC/DOCX, TXT.`));
    }
  },
});

async function ownStudent(userId: string) {
  return (await query<any>(
    `SELECT s.*,u.full_name,u.email,c.name AS "className",c.year AS "classYear",c.section AS "classSection",d.name AS "departmentName"
     FROM students s JOIN users u ON u.id=s.user_id
     LEFT JOIN classes c ON c.id=s.class_id
     LEFT JOIN departments d ON d.id=s.department_id
     WHERE s.user_id=$1`,
    [userId],
  )).rows[0];
}

async function strength(s: any) {
  const counts = (await query<any>(
    `SELECT (SELECT count(*) FROM marks WHERE student_id=$1) AS marks,
            (SELECT count(*) FROM projects WHERE student_id=$1) AS projects,
            (SELECT count(*) FROM achievements WHERE student_id=$1) AS achievements,
            (SELECT count(*) FROM certifications WHERE student_id=$1) AS certifications`,
    [s.id],
  )).rows[0];
  return calculateProfileStrength({
    profile_photo_url: s.profile_photo_url,
    resume_url: s.resume_url,
    linkedin_url: s.linkedin_url,
    github_url: s.github_url,
    bio: s.bio,
    has_marks: Number(counts.marks) > 0,
    projects_count: Number(counts.projects),
    achievements_count: Number(counts.achievements),
    certifications_count: Number(counts.certifications),
  });
}

router.get('/profile', async (req: AuthRequest, res) => {
  const s = await ownStudent(req.user!.id);
  if (!s) return res.status(404).json({ error: 'Student record not found.' });
  const resume = (await query(`SELECT * FROM student_documents WHERE student_id=$1 AND doc_type='resume' ORDER BY created_at DESC LIMIT 1`, [s.id])).rows[0] || null;
  const profileStrength = await strength(s);
  await query('UPDATE students SET profile_strength=$1 WHERE id=$2', [profileStrength, s.id]);
  res.json({ id: s.id, roll_number: s.roll_number, full_name: s.full_name, email: s.email, className: s.className || '', classYear: s.classYear || '', classSection: s.classSection || '', departmentName: s.departmentName || '', linkedin_url: s.linkedin_url || '', github_url: s.github_url || '', profile_photo_url: s.profile_photo_url || '', resume_url: s.resume_url || '', bio: s.bio || '', profile_strength: profileStrength, resumeDocument: resume });
});

router.put('/profile', async (req: AuthRequest, res) => {
  const s = await ownStudent(req.user!.id);
  if (!s) return res.status(404).json({ error: 'Student record not found.' });
  const { bio, linkedin_url, github_url } = req.body;
  if (linkedin_url && !/^https?:\/\/(www\.)?linkedin\.com\/.+/i.test(linkedin_url)) return res.status(400).json({ error: 'Please enter a valid LinkedIn profile URL.' });
  if (github_url && !/^https?:\/\/(www\.)?github\.com\/.+/i.test(github_url)) return res.status(400).json({ error: 'Please enter a valid GitHub profile URL.' });
  await query('UPDATE students SET bio=COALESCE($1,bio),linkedin_url=COALESCE($2,linkedin_url),github_url=COALESCE($3,github_url) WHERE id=$4', [typeof bio === 'string' ? bio.trim() : null, linkedin_url === undefined ? null : String(linkedin_url).trim(), github_url === undefined ? null : String(github_url).trim(), s.id]);
  const updated = await ownStudent(req.user!.id), profile_strength = await strength(updated);
  await query('UPDATE students SET profile_strength=$1 WHERE id=$2', [profile_strength, s.id]);
  res.json({ message: 'Profile updated successfully', student: { bio: updated.bio, linkedin_url: updated.linkedin_url, github_url: updated.github_url, profile_strength } });
});

router.post('/upload-photo', async (req: AuthRequest, res) => {
  const s = await ownStudent(req.user!.id);
  if (!s) return res.status(404).json({ error: 'Student record not found.' });
  if (!req.body.photo_data_url) return res.status(400).json({ error: 'Photo data is required.' });
  await query('UPDATE students SET profile_photo_url=$1 WHERE id=$2', [req.body.photo_data_url, s.id]);
  const updated = await ownStudent(req.user!.id), profile_strength = await strength(updated);
  await query('UPDATE students SET profile_strength=$1 WHERE id=$2', [profile_strength, s.id]);
  res.json({ message: 'Profile photo updated successfully', profile_photo_url: req.body.photo_data_url, profile_strength });
});

router.post('/upload-resume', async (req: AuthRequest, res) => {
  const s = await ownStudent(req.user!.id);
  if (!s) return res.status(404).json({ error: 'Student record not found.' });
  const filename = req.body.file_name || 'Resume.pdf';
  const doc = { id: id('doc'), student_id: s.id, title: filename, description: '', category: 'Resume', doc_type: 'resume', file_url: req.body.file_url || `/uploads/resumes/${s.roll_number}_${Date.now()}.pdf`, file_name: filename, parsed_headings: parseResumeContent(req.body.file_text || '', filename), status: 'processed' };
  await query("DELETE FROM student_documents WHERE student_id=$1 AND doc_type='resume'", [s.id]);
  await query('INSERT INTO student_documents (id,student_id,title,description,category,doc_type,file_url,file_name,parsed_headings,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [doc.id, doc.student_id, doc.title, doc.description, doc.category, doc.doc_type, doc.file_url, doc.file_name, JSON.stringify(doc.parsed_headings), doc.status]);
  await query('UPDATE students SET resume_url=$1 WHERE id=$2', [doc.file_url, s.id]);
  res.json({ message: 'Resume scanned and parsed successfully', document: doc, profile_strength: await strength(await ownStudent(req.user!.id)) });
});

router.get('/marks', async (req: AuthRequest, res) => {
  const s = await ownStudent(req.user!.id);
  if (!s) return res.status(404).json({ error: 'Student record not found.' });
  const [marks, marksheets] = await Promise.all([
    query<any>(`SELECT m.*,sem.name AS semester_name,sub.name AS subject_name,sub.code AS subject_code FROM marks m JOIN semesters sem ON sem.id=m.semester_id JOIN subjects sub ON sub.id=m.subject_id WHERE m.student_id=$1 ORDER BY m.created_at`, [s.id]),
    query('SELECT * FROM marksheets WHERE student_id=$1 ORDER BY created_at', [s.id]),
  ]);
  const semesterMap: any = {};
  for (const m of marks.rows) {
    semesterMap[m.semester_id] ??= { semester_id: m.semester_id, semester_name: m.semester_name, subjects: {} };
    semesterMap[m.semester_id].subjects[m.subject_id] ??= { subject_id: m.subject_id, subject_name: m.subject_name, subject_code: m.subject_code, marks: [] };
    semesterMap[m.semester_id].subjects[m.subject_id].marks.push({ exam_type: m.exam_type, marks_obtained: Number(m.marks_obtained), max_marks: Number(m.max_marks), percentage: Number((m.marks_obtained / m.max_marks * 100).toFixed(1)) });
  }
  res.json({ semestersData: Object.values(semesterMap), cgpaTrend: marksheets.rows.map((m: any) => ({ semesterId: m.semester_id, semesterName: m.semester_id, sgpa: Number(m.sgpa), cgpa: Number(m.cgpa), fileUrl: m.file_url, fileName: m.file_name })), officialMarksheets: marksheets.rows });
});

router.get('/marksheets/:marksheetId/file', async (req: AuthRequest, res) => {
  const s = await ownStudent(req.user!.id);
  const m = s ? (await query<any>('SELECT * FROM marksheets WHERE id=$1 AND student_id=$2', [req.params.marksheetId, s.id])).rows[0] : null;
  if (!m) return res.status(404).json({ error: 'Marksheet not found.' });
  const name = path.basename(m.file_url), file = path.join(marksheetDir, name);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Marksheet file is unavailable.' });
  res.type('application/pdf').setHeader('Content-Disposition', `inline; filename="${m.file_name}"`).sendFile(file);
});

router.get('/notifications', async (req: AuthRequest, res) => {
  const s = await ownStudent(req.user!.id);
  const rows = await query(`SELECT DISTINCT n.*,(nr.id IS NOT NULL) AS is_read FROM notifications n LEFT JOIN notification_reads nr ON nr.notification_id=n.id AND nr.user_id=$1 WHERE n.target_role IN ('all','all_students') OR (n.target_role='class' AND n.target_class_id=$2) ORDER BY n.created_at DESC`, [req.user!.id, s?.class_id || null]);
  res.json(rows.rows);
});

router.post('/notifications/:id/read', async (req: AuthRequest, res) => {
  await query('INSERT INTO notification_reads (id,notification_id,user_id) VALUES ($1,$2,$3) ON CONFLICT (notification_id,user_id) DO NOTHING', [id('nr'), req.params.id, req.user!.id]);
  res.json({ message: 'Marked as read' });
});

router.post('/notifications/read-all', async (req: AuthRequest, res) => {
  const s = await ownStudent(req.user!.id);
  await query(`INSERT INTO notification_reads (id,notification_id,user_id) SELECT $1||n.id,n.id,$2 FROM notifications n WHERE n.target_role IN ('all','all_students') OR (n.target_role='class' AND n.target_class_id=$3) ON CONFLICT (notification_id,user_id) DO NOTHING`, [id('nr'), req.user!.id, s?.class_id || null]);
  res.json({ message: 'All notifications marked as read' });
});

// ── Document Vault ────────────────────────────────────────────────────────────

/** List own documents */
router.get('/documents', async (req: AuthRequest, res) => {
  const s = await ownStudent(req.user!.id);
  res.json((await query('SELECT * FROM student_documents WHERE student_id=$1 ORDER BY created_at DESC', [s.id])).rows);
});

/** Upload a real file (multipart/form-data). Fields: file, title, description, category */
router.post('/documents', docUpload.single('file'), async (req: AuthRequest, res) => {
  const s = await ownStudent(req.user!.id);
  if (!s) return res.status(404).json({ error: 'Student record not found.' });
  if (!req.file) return res.status(400).json({ error: 'A file is required. Supported types: PDF, images, DOC/DOCX, TXT.' });
  const { title, description, category } = req.body;
  if (!title || !category) return res.status(400).json({ error: 'Title and category are required.' });
  const ext = path.extname(req.file.originalname).slice(1).toLowerCase() || 'bin';
  const fileUrl = `/uploads/student-docs/${req.file.filename}`;
  const d = {
    id: id('doc'),
    student_id: s.id,
    title: String(title).trim(),
    description: description || '',
    category,
    doc_type: ext,
    file_url: fileUrl,
    file_name: req.file.originalname,
    status: 'processed',
  };
  await query(
    'INSERT INTO student_documents (id,student_id,title,description,category,doc_type,file_url,file_name,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [d.id, d.student_id, d.title, d.description, d.category, d.doc_type, d.file_url, d.file_name, d.status],
  );
  await logActivity(req.user!.id, 'DOCUMENT_UPLOAD', 'STUDENT_DOCUMENT', d.id, `Student uploaded document: ${req.file.originalname} (${req.file.size} bytes).`);
  res.status(201).json({ message: 'Document uploaded successfully', document: { ...d, mime_type: req.file.mimetype, size_bytes: req.file.size } });
});

/** Serve own document file (authenticated) */
router.get('/documents/:docId/file', async (req: AuthRequest, res) => {
  const s = await ownStudent(req.user!.id);
  if (!s) return res.status(403).json({ error: 'Access denied.' });
  const doc = (await query<any>('SELECT * FROM student_documents WHERE id=$1 AND student_id=$2', [req.params.docId, s.id])).rows[0];
  if (!doc) return res.status(404).json({ error: 'Document not found or access denied.' });
  const filename = path.basename(doc.file_url);
  const filePath = path.join(studentDocDir, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Document file is unavailable on disk.' });
  res.setHeader('Content-Disposition', `inline; filename="${doc.file_name}"`);
  res.sendFile(filePath);
});

/** Delete own document and its physical file */
router.delete('/documents/:id', async (req: AuthRequest, res) => {
  const s = await ownStudent(req.user!.id);
  const doc = (await query<any>('SELECT * FROM student_documents WHERE id=$1 AND student_id=$2', [req.params.id, s.id])).rows[0];
  if (!doc) return res.status(404).json({ error: 'Document not found or unauthorized' });
  const filename = path.basename(doc.file_url);
  const filePath = path.join(studentDocDir, filename);
  if (fs.existsSync(filePath)) { try { fs.unlinkSync(filePath); } catch (_) { /* best-effort */ } }
  await query('DELETE FROM student_documents WHERE id=$1 AND student_id=$2', [req.params.id, s.id]);
  res.json({ message: 'Document removed successfully' });
});

// ── Portfolio items ───────────────────────────────────────────────────────────

function portfolio(table: string, fields: string[]) {
  router.get(`/${table}`, async (req: AuthRequest, res) => {
    const s = await ownStudent(req.user!.id);
    res.json((await query(`SELECT * FROM ${table} WHERE student_id=$1 ORDER BY created_at DESC`, [s.id])).rows);
  });
  router.post(`/${table}`, async (req: AuthRequest, res) => {
    const s = await ownStudent(req.user!.id);
    const values = fields.map(f => req.body[f] ?? (f === 'technologies' || f === 'team_members' ? '[]' : ''));
    const record = { id: id(table.slice(0, -1)), student_id: s.id, ...Object.fromEntries(fields.map((f, i) => [f, values[i]])) };
    await query(`INSERT INTO ${table} (id,student_id,${fields.join(',')}) VALUES ($1,$2,${fields.map((_, i) => `$${i + 3}`).join(',')})`, [record.id, record.student_id, ...values.map(v => Array.isArray(v) ? JSON.stringify(v) : v)]);
    res.status(201).json({ message: `${table} record created successfully`, [table.slice(0, -1)]: record });
  });
  router.delete(`/${table}/:id`, async (req: AuthRequest, res) => {
    const s = await ownStudent(req.user!.id);
    await query(`DELETE FROM ${table} WHERE id=$1 AND student_id=$2`, [req.params.id, s.id]);
    res.json({ message: `${table} record removed successfully` });
  });
}

portfolio('projects', ['title', 'description', 'technologies', 'github_url', 'live_url', 'date', 'team_members', 'image_url']);
portfolio('achievements', ['title', 'description', 'organization', 'date', 'link', 'certificate_url']);
portfolio('certifications', ['name', 'issuer', 'issue_date', 'credential_id', 'credential_url', 'certificate_url']);
portfolio('hackathons', ['name', 'organizer', 'date', 'position_result', 'team_name', 'project_name', 'project_description', 'github_url', 'demo_url', 'certificate_url']);

router.get('/events', async (_req, res) => res.json((await query('SELECT * FROM events ORDER BY event_date DESC')).rows));
router.post('/ai-query', rateLimit(25, 60000, 'student-ai'), async (req: AuthRequest, res) => res.json(await processAiQuery(req.user!, String(req.body.query || ''))));

export default router;
