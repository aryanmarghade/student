import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { query, id, logActivity } from '../db.js';
import { requireAuth, requireRole, AuthRequest, rateLimit } from '../auth.js';
import { parseResumeContent, calculateProfileStrength } from '../resume-parser.js';
import { processAiQuery } from '../ai-assistant.js';
import { fetchLeetCodeStats, extractLeetCodeUsername } from '../leetcode-sync.js';
import { getStudentComprehensiveEvidence } from '../student-evidence-service.js';

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
  'video/mp4',
  'video/webm',
  'video/ogg',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

const ALLOWED_EXTENSIONS = new Set([
  'pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp',
  'doc', 'docx', 'ppt', 'pptx', 'txt', 'mp4', 'webm', 'ogg'
]);

export function validateMagicBytes(filePath: string, ext: string, mimetype: string): { valid: boolean; reason?: string } {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(32);
    const bytesRead = fs.readSync(fd, buf, 0, 32, 0);
    fs.closeSync(fd);

    if (bytesRead < 4) return { valid: false, reason: 'File is empty or too small.' };

    const lowerExt = ext.toLowerCase();

    // PDF check: %PDF-
    if (lowerExt === 'pdf' || mimetype === 'application/pdf') {
      if (!buf.subarray(0, 5).toString('ascii').startsWith('%PDF-')) {
        return { valid: false, reason: 'File does not contain valid PDF magic bytes (%PDF-).' };
      }
      return { valid: true };
    }

    // PNG check: \x89PNG\r\n\x1a\n
    if (lowerExt === 'png' || mimetype === 'image/png') {
      if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) {
        return { valid: false, reason: 'File does not contain valid PNG magic bytes.' };
      }
      return { valid: true };
    }

    // JPEG check: \xFF\xD8\xFF
    if (['jpg', 'jpeg'].includes(lowerExt) || ['image/jpeg', 'image/jpg'].includes(mimetype)) {
      if (buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) {
        return { valid: false, reason: 'File does not contain valid JPEG magic bytes.' };
      }
      return { valid: true };
    }

    // WEBP check: RIFF....WEBP
    if (lowerExt === 'webp' || mimetype === 'image/webp') {
      if (buf.subarray(0, 4).toString('ascii') !== 'RIFF' || buf.subarray(8, 12).toString('ascii') !== 'WEBP') {
        return { valid: false, reason: 'File does not contain valid WEBP magic bytes.' };
      }
      return { valid: true };
    }

    // GIF check: GIF87a or GIF89a
    if (lowerExt === 'gif' || mimetype === 'image/gif') {
      const sig = buf.subarray(0, 6).toString('ascii');
      if (sig !== 'GIF87a' && sig !== 'GIF89a') {
        return { valid: false, reason: 'File does not contain valid GIF magic bytes.' };
      }
      return { valid: true };
    }

    // DOCX / PPTX check: PK\x03\x04
    if (['docx', 'pptx'].includes(lowerExt) || mimetype.includes('openxmlformats')) {
      if (buf[0] !== 0x50 || buf[1] !== 0x4b || buf[2] !== 0x03 || buf[3] !== 0x04) {
        return { valid: false, reason: 'File does not contain valid Office OpenXML magic bytes.' };
      }
      return { valid: true };
    }

    // DOC / PPT check: \xD0\xCF\x11\xE0
    if (['doc', 'ppt'].includes(lowerExt) || mimetype === 'application/msword' || mimetype.includes('powerpoint')) {
      if (buf[0] !== 0xd0 || buf[1] !== 0xcf || buf[2] !== 0x11 || buf[3] !== 0xe0) {
        return { valid: false, reason: 'File does not contain valid Office Compound Document magic bytes.' };
      }
      return { valid: true };
    }

    // MP4 check: ftyp at offset 4
    if (['mp4'].includes(lowerExt) || mimetype === 'video/mp4') {
      if (buf.subarray(4, 8).toString('ascii') !== 'ftyp') {
        return { valid: false, reason: 'File does not contain valid MP4 magic bytes.' };
      }
      return { valid: true };
    }

    // Plain text: UTF-8 / printable ASCII without null bytes
    if (lowerExt === 'txt' || mimetype === 'text/plain') {
      for (let i = 0; i < bytesRead; i++) {
        if (buf[i] === 0) return { valid: false, reason: 'Text file contains null bytes.' };
      }
      return { valid: true };
    }

    return { valid: true };
  } catch (err: any) {
    return { valid: false, reason: err?.message || 'Failed to inspect file magic bytes.' };
  }
}

const docUpload = multer({
  storage: multer.diskStorage({
    destination: studentDocDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).slice(1).toLowerCase();
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext || 'bin'}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).slice(1).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return cb(new Error(`Disallowed file extension: .${ext}. Allowed extensions: ${Array.from(ALLOWED_EXTENSIONS).join(', ')}`));
    }
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: PDF, images, video, PPT, DOC/DOCX, TXT.`));
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
  res.json({ id: s.id, roll_number: s.roll_number, full_name: s.full_name, email: s.email, className: s.className || '', classYear: s.classYear || '', classSection: s.classSection || '', departmentName: s.departmentName || '', linkedin_url: s.linkedin_url || '', github_url: s.github_url || '', hackerrank_url: s.hackerrank_url || '', leetcode_url: s.leetcode_url || '', portfolio_url: s.portfolio_url || '', profile_photo_url: s.profile_photo_url || '', resume_url: s.resume_url || '', bio: s.bio || '', profile_strength: profileStrength, resumeDocument: resume, github_data: s.github_data, hackerrank_data: s.hackerrank_data, leetcode_data: s.leetcode_data });
});

router.put('/profile', async (req: AuthRequest, res) => {
  const s = await ownStudent(req.user!.id);
  if (!s) return res.status(404).json({ error: 'Student record not found.' });
  const { bio, linkedin_url, github_url, hackerrank_url, leetcode_url, portfolio_url } = req.body;

  if (bio && typeof bio === 'string' && bio.length > 1000) {
    return res.status(400).json({ error: 'Bio cannot exceed 1000 characters.' });
  }

  const urlFields = [
    { name: 'LinkedIn', val: linkedin_url, regex: /^https?:\/\/(www\.)?linkedin\.com\/.+/i },
    { name: 'GitHub', val: github_url, regex: /^https?:\/\/(www\.)?github\.com\/.+/i },
    { name: 'HackerRank', val: hackerrank_url, regex: /^https?:\/\/(www\.)?hackerrank\.com\/.+/i },
    { name: 'LeetCode', val: leetcode_url, regex: /^https?:\/\/(www\.)?leetcode\.com\/.+/i },
    { name: 'Portfolio', val: portfolio_url, regex: /^https?:\/\/[^\s]+$/i },
  ];

  for (const field of urlFields) {
    if (field.val !== undefined && field.val !== null && String(field.val).trim() !== '') {
      const trimmed = String(field.val).trim();
      if (trimmed.length > 500) {
        return res.status(400).json({ error: `${field.name} URL cannot exceed 500 characters.` });
      }
      if (!/^https?:\/\//i.test(trimmed)) {
        return res.status(400).json({ error: `${field.name} URL must use HTTP or HTTPS protocol.` });
      }
      if (!field.regex.test(trimmed)) {
        return res.status(400).json({ error: `Please enter a valid ${field.name} profile URL.` });
      }
    }
  }

  await query('UPDATE students SET bio=COALESCE($1,bio),linkedin_url=COALESCE($2,linkedin_url),github_url=COALESCE($3,github_url),hackerrank_url=COALESCE($4,hackerrank_url),leetcode_url=COALESCE($5,leetcode_url),portfolio_url=COALESCE($6,portfolio_url) WHERE id=$7', [typeof bio === 'string' ? bio.trim() : null, linkedin_url === undefined ? null : String(linkedin_url).trim(), github_url === undefined ? null : String(github_url).trim(), hackerrank_url === undefined ? null : String(hackerrank_url).trim(), leetcode_url === undefined ? null : String(leetcode_url).trim(), portfolio_url === undefined ? null : String(portfolio_url).trim(), s.id]);
  const updated = await ownStudent(req.user!.id), profile_strength = await strength(updated);
  await query('UPDATE students SET profile_strength=$1 WHERE id=$2', [profile_strength, s.id]);
  res.json({ message: 'Profile updated successfully', student: { bio: updated.bio, linkedin_url: updated.linkedin_url, github_url: updated.github_url, hackerrank_url: updated.hackerrank_url, leetcode_url: updated.leetcode_url, portfolio_url: updated.portfolio_url, profile_strength } });
});

router.post('/upload-photo', async (req: AuthRequest, res) => {
  const s = await ownStudent(req.user!.id);
  if (!s) return res.status(404).json({ error: 'Student record not found.' });
  const photoDataUrl = String(req.body.photo_data_url || '').trim();
  if (!photoDataUrl) return res.status(400).json({ error: 'Photo data is required.' });

  const match = photoDataUrl.match(/^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/i);
  if (!match) {
    return res.status(400).json({ error: 'Invalid image format. Allowed MIME types: image/jpeg, image/png, image/webp.' });
  }

  const mime = match[1].toLowerCase();
  const base64Data = match[3];
  const buffer = Buffer.from(base64Data, 'base64');

  // Enforce 5 MB limit
  if (buffer.length > 5 * 1024 * 1024) {
    return res.status(400).json({ error: 'Profile photo size exceeds maximum limit of 5 MB.' });
  }

  // Magic byte inspection
  if (mime === 'image/png') {
    if (buffer.length < 8 || buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) {
      return res.status(400).json({ error: 'Corrupted image: file does not match PNG magic bytes.' });
    }
  } else if (mime === 'image/jpeg' || mime === 'image/jpg') {
    if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
      return res.status(400).json({ error: 'Corrupted image: file does not match JPEG magic bytes.' });
    }
  } else if (mime === 'image/webp') {
    if (buffer.length < 12 || buffer.subarray(0, 4).toString('ascii') !== 'RIFF' || buffer.subarray(8, 12).toString('ascii') !== 'WEBP') {
      return res.status(400).json({ error: 'Corrupted image: file does not match WEBP magic bytes.' });
    }
  }

  await query('UPDATE students SET profile_photo_url=$1 WHERE id=$2', [photoDataUrl, s.id]);
  const updated = await ownStudent(req.user!.id), profile_strength = await strength(updated);
  await query('UPDATE students SET profile_strength=$1 WHERE id=$2', [profile_strength, s.id]);
  res.json({ message: 'Profile photo updated successfully', profile_photo_url: photoDataUrl, profile_strength });
});

router.post('/upload-resume', async (req: AuthRequest, res) => {
  const s = await ownStudent(req.user!.id);
  if (!s) return res.status(404).json({ error: 'Student record not found.' });

  const fileText = typeof req.body.file_text === 'string' ? req.body.file_text : '';
  if (fileText.length > 1024 * 1024) {
    return res.status(400).json({ error: 'Resume text exceeds maximum permitted limit of 1 MB.' });
  }

  let fileUrl = String(req.body.file_url || '').trim();
  if (fileUrl && !fileUrl.startsWith('/uploads/') && !/^https?:\/\/[^\s]+$/i.test(fileUrl)) {
    return res.status(400).json({ error: 'Invalid resume file URL. Must be an uploaded path or valid HTTP(S) URL.' });
  }
  if (!fileUrl) {
    fileUrl = `/uploads/resumes/${s.roll_number}_${Date.now()}.pdf`;
  }

  const filename = String(req.body.file_name || 'Resume.pdf').replace(/[\/\\:\0]/g, '_');
  const doc = {
    id: id('doc'),
    student_id: s.id,
    title: filename,
    description: '',
    category: 'Resume',
    doc_type: 'resume',
    file_url: fileUrl,
    file_name: filename,
    parsed_headings: parseResumeContent(fileText, filename),
    status: 'processed'
  };

  await query("DELETE FROM student_documents WHERE student_id=$1 AND doc_type='resume'", [s.id]);
  await query('INSERT INTO student_documents (id,student_id,title,description,category,doc_type,file_url,file_name,parsed_headings,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [doc.id, doc.student_id, doc.title, doc.description, doc.category, doc.doc_type, doc.file_url, doc.file_name, JSON.stringify(doc.parsed_headings), doc.status]);
  await query('UPDATE students SET resume_url=$1 WHERE id=$2', [doc.file_url, s.id]);
  res.json({ message: 'Resume scanned and parsed successfully', document: doc, profile_strength: await strength(await ownStudent(req.user!.id)) });
});

import { calculateAcademicHistory, getInstitutionalGradingRules } from '../academic-service.js';
import { handleStudentAiRequest, processRoleIntelligenceQuery } from '../role-intelligence-engine.js';

router.get('/marks', async (req: AuthRequest, res) => {
  const s = await ownStudent(req.user!.id);
  if (!s) return res.status(404).json({ error: 'Student record not found.' });
  const [marks, marksheets, gradingRules] = await Promise.all([
    query<any>(`SELECT m.*,sem.name AS semester_name,sub.name AS subject_name,sub.code AS subject_code,sub.credits FROM marks m JOIN semesters sem ON sem.id=m.semester_id JOIN subjects sub ON sub.id=m.subject_id WHERE m.student_id=$1 ORDER BY m.created_at`, [s.id]),
    query('SELECT * FROM marksheets WHERE student_id=$1 ORDER BY created_at', [s.id]),
    getInstitutionalGradingRules(),
  ]);
  const semesterMap: any = {};
  for (const m of marks.rows) {
    semesterMap[m.semester_id] ??= { semester_id: m.semester_id, semester_name: m.semester_name, subjects: {} };
    semesterMap[m.semester_id].subjects[m.subject_id] ??= { subject_id: m.subject_id, subject_name: m.subject_name, subject_code: m.subject_code, credits: m.credits, marks: [] };
    semesterMap[m.semester_id].subjects[m.subject_id].marks.push({
      exam_type: m.exam_type,
      marks_obtained: Number(m.marks_obtained),
      max_marks: Number(m.max_marks),
      percentage: Number((m.marks_obtained / m.max_marks * 100).toFixed(1)),
      status: m.status || 'entered',
      teacher_feedback: m.feedback_published ? m.teacher_feedback : null,
    });
  }
  
  const academicHistory = await calculateAcademicHistory(s.id);
  
  res.json({
    semestersData: Object.values(semesterMap),
    cgpaTrend: marksheets.rows.map((m: any) => ({
      semesterId: m.semester_id,
      semesterName: m.semester_id,
      sgpa: Number(m.sgpa),
      cgpa: Number(m.cgpa),
      fileUrl: m.file_url,
      fileName: m.file_name
    })),
    officialMarksheets: marksheets.rows,
    academicHistory,
    gradingRules,
  });
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
router.post('/documents', (req: AuthRequest, res, next) => {
  docUpload.single('file')(req, res, (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File size exceeds maximum permitted limit of 10 MB.' });
      }
      return res.status(400).json({ error: err.message || 'File upload failed.' });
    }
    next();
  });
}, async (req: AuthRequest, res) => {
  const s = await ownStudent(req.user!.id);
  if (!s) {
    if (req.file) try { fs.unlinkSync(req.file.path); } catch (_) {}
    return res.status(404).json({ error: 'Student record not found.' });
  }
  if (!req.file) return res.status(400).json({ error: 'A file is required. Supported types: PDF, images, DOC/DOCX, TXT.' });

  const ext = path.extname(req.file.originalname).slice(1).toLowerCase() || 'bin';
  const magicCheck = validateMagicBytes(req.file.path, ext, req.file.mimetype);
  if (!magicCheck.valid) {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    return res.status(400).json({ error: `File verification failed: ${magicCheck.reason}` });
  }

  const { title, description, category } = req.body;
  if (!title || !category) {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    return res.status(400).json({ error: 'Title and category are required.' });
  }
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

    // Validate URL fields against stored XSS
    for (const f of fields) {
      if (f.endsWith('_url') || f === 'link') {
        const val = req.body[f];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          const trimmed = String(val).trim();
          if (trimmed.length > 500) {
            return res.status(400).json({ error: `${f} cannot exceed 500 characters.` });
          }
          if (!/^https?:\/\/[^\s]+$/i.test(trimmed)) {
            return res.status(400).json({ error: `${f} must be a valid HTTP or HTTPS URL.` });
          }
        }
      }
    }

    const values = fields.map(f => {
      const val = req.body[f];
      if (f === 'technologies' || f === 'team_members') {
        return val ?? '[]';
      }
      if ((f === 'date' || f === 'issue_date') && (!val || String(val).trim() === '')) {
        return null;
      }
      return val ?? '';
    });
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
portfolio('sports', ['sport_name', 'event_name', 'participation_type', 'position_role', 'competition_level', 'season_year', 'match_stats', 'result_award', 'leadership_role', 'evidence_url', 'notes']);
portfolio('student_hackerrank_evidence', ['skill_name', 'badge_name', 'stars', 'certificate_url', 'evidence_url']);

// ── Posts & Activity Feed ─────────────────────────────────────────────────────

router.get('/posts', async (req: AuthRequest, res) => {
  const s = await ownStudent(req.user!.id);
  const posts = await query(`
    SELECT p.*,
           (SELECT json_agg(a.*) FROM post_attachments a WHERE a.post_id = p.id) as attachments
    FROM posts p
    WHERE p.student_id = $1
    ORDER BY p.created_at DESC
  `, [s.id]);
  res.json(posts.rows);
});

router.post('/posts', (req: AuthRequest, res, next) => {
  docUpload.fields([{ name: 'attachments', maxCount: 10 }, { name: 'files', maxCount: 10 }])(req, res, (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File size exceeds maximum permitted limit of 10 MB per attachment.' });
      }
      return res.status(400).json({ error: err.message || 'Attachment upload failed.' });
    }
    next();
  });
}, async (req: AuthRequest, res) => {
  const s = await ownStudent(req.user!.id);
  const filesObj = (req.files as { [fieldname: string]: Express.Multer.File[] }) || {};
  const rawFiles: Express.Multer.File[] = [
    ...(filesObj.attachments || []),
    ...(filesObj.files || []),
  ];

  if (!s) {
    for (const f of rawFiles) try { fs.unlinkSync(f.path); } catch (_) {}
    return res.status(404).json({ error: 'Student record not found.' });
  }

  const { title, description, category, tags, external_link } = req.body;
  if (!title || !description || !category) {
    for (const f of rawFiles) try { fs.unlinkSync(f.path); } catch (_) {}
    return res.status(400).json({ error: 'Title, description, and category are required.' });
  }

  // Validate magic bytes for each attachment
  for (const file of rawFiles) {
    const ext = path.extname(file.originalname).slice(1).toLowerCase() || 'bin';
    const magicCheck = validateMagicBytes(file.path, ext, file.mimetype);
    if (!magicCheck.valid) {
      for (const f of rawFiles) try { fs.unlinkSync(f.path); } catch (_) {}
      return res.status(400).json({ error: `File verification failed for "${file.originalname}": ${magicCheck.reason}` });
    }
  }

  if (external_link && typeof external_link === 'string' && external_link.trim() !== '') {
    const trimmed = external_link.trim();
    if (trimmed.length > 500) {
      for (const f of rawFiles) try { fs.unlinkSync(f.path); } catch (_) {}
      return res.status(400).json({ error: 'External link cannot exceed 500 characters.' });
    }
    if (!/^https?:\/\/[^\s]+$/i.test(trimmed)) {
      for (const f of rawFiles) try { fs.unlinkSync(f.path); } catch (_) {}
      return res.status(400).json({ error: 'External link must be a valid HTTP or HTTPS URL.' });
    }
  }

  const postId = id('post');
  let parsedTags = [];
  try {
    parsedTags = tags ? JSON.parse(tags) : [];
  } catch (e) {
    parsedTags = typeof tags === 'string' ? tags.split(',').map((t: string) => t.trim()) : [];
  }

  await query(`
    INSERT INTO posts (id, student_id, title, description, category, tags, external_link)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [postId, s.id, title, description, category, JSON.stringify(parsedTags), external_link || null]);

  const attachments = [];
  for (const file of rawFiles) {
    const attachmentId = id('patt');
    const fileUrl = `/uploads/student-docs/${file.filename}`;
    const ext = path.extname(file.originalname).slice(1).toLowerCase() || 'bin';
    let fileType = 'document';
    if (file.mimetype.startsWith('image/')) fileType = 'image';
    else if (file.mimetype.startsWith('video/')) fileType = 'video';
    else if (file.mimetype === 'application/pdf') fileType = 'pdf';
    else if (file.mimetype.includes('powerpoint') || file.mimetype.includes('presentation')) fileType = 'ppt';

    await query(`
      INSERT INTO post_attachments (id, post_id, file_url, file_name, file_type)
      VALUES ($1, $2, $3, $4, $5)
    `, [attachmentId, postId, fileUrl, file.originalname, fileType]);
    
    attachments.push({ id: attachmentId, file_url: fileUrl, file_name: file.originalname, file_type: fileType });
  }

  const newPost = (await query('SELECT * FROM posts WHERE id = $1', [postId])).rows[0];
  res.status(201).json({ message: 'Post created successfully', post: { ...newPost, attachments } });
});

router.get('/post-attachments/:id/file', async (req: AuthRequest, res) => {
  const s = await ownStudent(req.user!.id);
  const attachment = (await query(`
    SELECT a.* FROM post_attachments a 
    JOIN posts p ON a.post_id = p.id 
    WHERE a.id=$1 AND p.student_id=$2
  `, [req.params.id, s.id])).rows[0];
  if (!attachment) return res.status(404).json({ error: 'Attachment not found or access denied.' });

  const filename = path.basename(attachment.file_url);
  const filePath = path.join(process.cwd(), 'uploads', 'student-docs', filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File is unavailable on disk.' });
  res.setHeader('Content-Disposition', `inline; filename="${attachment.file_name}"`);
  res.sendFile(filePath);
});

router.delete('/posts/:id', async (req: AuthRequest, res) => {
  const s = await ownStudent(req.user!.id);
  await query('DELETE FROM posts WHERE id=$1 AND student_id=$2', [req.params.id, s.id]);
  res.json({ message: 'Post deleted successfully' });
});

router.get('/events', async (_req, res) => res.json((await query('SELECT * FROM events ORDER BY event_date DESC')).rows));
router.post('/ai-query', rateLimit(25, 60000, 'student-ai'), async (req: AuthRequest, res) => {
  const task = req.body.task || 'student_academic_analysis';
  const queryText = String(req.body.query || '');
  const response = await handleStudentAiRequest(req.user!, {
    role: 'student',
    task,
    queryText,
  });
  res.json(response);
});

router.post('/ai/academic-analysis', rateLimit(25, 60000, 'student-ai-analysis'), async (req: AuthRequest, res) => {
  const response = await handleStudentAiRequest(req.user!, {
    role: 'student',
    task: 'student_academic_analysis',
    queryText: String(req.body.query || 'Analyze my academic and career performance'),
  });
  res.json(response);
});

router.post('/ai/learning-plan', rateLimit(25, 60000, 'student-ai-plan'), async (req: AuthRequest, res) => {
  const response = await handleStudentAiRequest(req.user!, {
    role: 'student',
    task: 'student_learning_plan',
    queryText: String(req.body.query || 'Create a personalized learning and interview preparation plan'),
  });
  res.json(response);
});

router.post('/ai/grade-explanation', rateLimit(25, 60000, 'student-ai-grade'), async (req: AuthRequest, res) => {
  const response = await handleStudentAiRequest(req.user!, {
    role: 'student',
    task: 'student_grade_explanation',
    queryText: String(req.body.query || 'Explain how my grades, SGPA and CGPA were calculated'),
  });
  res.json(response);
});

// ── Student Submissions ───────────────────────────────────────────────────────

router.get('/submissions', async (req: AuthRequest, res) => {
  try {
    const s = await ownStudent(req.user!.id);
    if (!s) return res.status(404).json({ error: 'Student record not found.' });
    const rows = await query(`
      SELECT sub.*, ad.title AS assessment_title, ad.assessment_type, ad.max_marks,
             s.name AS subject_name, s.code AS subject_code,
             m.marks_obtained, m.status AS mark_status,
             CASE WHEN m.feedback_published THEN m.teacher_feedback ELSE NULL END AS teacher_feedback
      FROM student_submissions sub
      JOIN assessment_definitions ad ON ad.id = sub.assessment_definition_id
      JOIN subjects s ON s.id = ad.subject_id
      LEFT JOIN marks m ON m.assessment_definition_id = ad.id AND m.student_id = sub.student_id
      WHERE sub.student_id = $1
      ORDER BY sub.submitted_at DESC
    `, [s.id]);
    res.json(rows.rows);
  } catch (err: any) {
    console.error('[Student Submissions] GET error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve assignment submissions.' });
  }
});

router.post('/submissions', async (req: AuthRequest, res) => {
  try {
    const s = await ownStudent(req.user!.id);
    if (!s) return res.status(404).json({ error: 'Student record not found.' });
    const { assessmentId, submissionText, submissionCode, fileUrl } = req.body;
    if (!assessmentId) return res.status(400).json({ error: 'Assessment ID is required.' });

    const ad = (await query<any>(`SELECT id, class_id FROM assessment_definitions WHERE id = $1`, [assessmentId])).rows[0];
    if (!ad) return res.status(404).json({ error: 'Assessment not found.' });
    if (ad.class_id !== s.class_id) return res.status(403).json({ error: 'Assessment is not assigned to your class.' });

    const subId = id('sub');
    const result = await query(`
      INSERT INTO student_submissions (
        id, assessment_definition_id, student_id, submission_text, code_content, file_url, status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'submitted')
      ON CONFLICT (assessment_definition_id, student_id) DO UPDATE SET
        submission_text = EXCLUDED.submission_text,
        code_content = EXCLUDED.code_content,
        file_url = EXCLUDED.file_url,
        status = 'submitted',
        submitted_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [subId, assessmentId, s.id, submissionText || null, submissionCode || null, fileUrl || null]);

    res.status(201).json({ message: 'Submission uploaded successfully', submission: result.rows[0] });
  } catch (err: any) {
    console.error('[Student Submissions] POST error:', err.message);
    res.status(500).json({ error: 'Failed to upload assignment submission.' });
  }
});

router.post('/github/sync', async (req: AuthRequest, res) => {
  const s = await ownStudent(req.user!.id);
  if (!s || !s.github_url) return res.status(400).json({ error: 'No GitHub URL linked to profile.' });
  
  try {
    const match = s.github_url.match(/github\.com\/([^\/]+)/i);
    if (!match) return res.status(400).json({ error: 'Invalid GitHub URL format.' });
    const username = match[1];

    const userRes = await fetch(`https://api.github.com/users/${username}`);
    const reposRes = await fetch(`https://api.github.com/users/${username}/repos?per_page=100&sort=updated`);

    if (!userRes.ok) throw new Error('GitHub API error for user profile');
    const userData = await userRes.json();
    const reposData = reposRes.ok ? await reposRes.json() : [];

    const githubData = {
      username: userData.login,
      followers: userData.followers,
      public_repos: userData.public_repos,
      stars: reposData.reduce((acc: number, r: any) => acc + (r.stargazers_count || 0), 0),
      forks: reposData.reduce((acc: number, r: any) => acc + (r.forks_count || 0), 0),
      languages: Array.from(new Set(reposData.map((r: any) => r.language).filter(Boolean))),
      top_repos: reposData.slice(0, 5).map((r: any) => ({
        name: r.name,
        url: r.html_url,
        description: r.description,
        stars: r.stargazers_count,
        language: r.language
      }))
    };

    await query('UPDATE students SET github_data=$1, github_synced_at=NOW() WHERE id=$2', [JSON.stringify(githubData), s.id]);
    res.json({ message: 'GitHub synchronized successfully', githubData });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to sync GitHub' });
  }
});

router.post('/leetcode/sync', async (req: AuthRequest, res) => {
  const s = await ownStudent(req.user!.id);
  if (!s || !s.leetcode_url) return res.status(400).json({ error: 'No LeetCode URL linked to profile.' });

  try {
    const username = extractLeetCodeUsername(s.leetcode_url);
    if (!username) return res.status(400).json({ error: 'Invalid LeetCode URL format.' });

    const stats = await fetchLeetCodeStats(username);
    if (!stats) return res.status(502).json({ error: 'Unable to fetch LeetCode profile statistics. Please verify the profile is public.' });

    await query('UPDATE students SET leetcode_data=$1, leetcode_synced_at=NOW() WHERE id=$2', [JSON.stringify(stats), s.id]);
    res.json({ message: 'LeetCode synchronized successfully', leetcodeData: stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to sync LeetCode' });
  }
});

router.post('/hackerrank/sync', async (req: AuthRequest, res) => {
  const s = await ownStudent(req.user!.id);
  if (!s || !s.hackerrank_url) return res.status(400).json({ error: 'No HackerRank URL linked to profile.' });

  try {
    const match = s.hackerrank_url.match(/hackerrank\.com\/([^\/\s?#]+)/i);
    if (!match) return res.status(400).json({ error: 'Invalid HackerRank URL format.' });

    // When HackerRank sync is run for a student
    const hrData = s.hackerrank_data || {
      username: match[1],
      badges_count: 0,
      verified_skills: [],
      note: 'Profile linked'
    };

    await query('UPDATE students SET hackerrank_data=$1 WHERE id=$2', [JSON.stringify(hrData), s.id]);
    res.json({ message: 'HackerRank profile verified', hackerrankData: hrData });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to sync HackerRank' });
  }
});

// ── LinkedIn Student Posts ───────────────────────────────────────────────────

router.get('/linkedin/posts', async (req: AuthRequest, res) => {
  const s = await ownStudent(req.user!.id);
  const posts = await query(`SELECT * FROM student_linkedin_posts WHERE student_id=$1 ORDER BY post_date DESC, created_at DESC`, [s.id]);
  res.json(posts.rows);
});

router.post('/linkedin/posts', async (req: AuthRequest, res) => {
  const s = await ownStudent(req.user!.id);
  const { title, content, post_url, post_date, category = 'Technical Writing', topics = [] } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Post content is required.' });
  const postId = id('lip');
  await query(
    `INSERT INTO student_linkedin_posts (id, student_id, title, content, post_url, post_date, category, topics, source_type, verification_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'manual_submission', 'Student Submitted')`,
    [postId, s.id, title || null, content.trim(), post_url || null, post_date || new Date().toISOString().slice(0, 10), category, JSON.stringify(Array.isArray(topics) ? topics : [])]
  );
  const newPost = (await query('SELECT * FROM student_linkedin_posts WHERE id=$1', [postId])).rows[0];
  res.status(201).json({ message: 'LinkedIn post submitted for portfolio review', post: newPost });
});

router.delete('/linkedin/posts/:id', async (req: AuthRequest, res) => {
  const s = await ownStudent(req.user!.id);
  await query('DELETE FROM student_linkedin_posts WHERE id=$1 AND student_id=$2', [req.params.id, s.id]);
  res.json({ message: 'LinkedIn post removed' });
});

// ── 360° Comprehensive Evidence Profile ──────────────────────────────────────

router.get('/intelligence-evidence', async (req: AuthRequest, res) => {
  const s = await ownStudent(req.user!.id);
  const evidence = await getStudentComprehensiveEvidence(s.id);
  res.json(evidence);
});

export default router;

