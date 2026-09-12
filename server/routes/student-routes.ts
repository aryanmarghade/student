import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { memDb, StudentDocumentRecord } from '../db.js';
import { requireAuth, requireRole, AuthRequest, rateLimit } from '../auth.js';
import { parseResumeContent, calculateProfileStrength } from '../resume-parser.js';
import { processAiQuery } from '../ai-assistant.js';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const marksheetDir = path.join(__dirname, '../../uploads/marksheets');

// Middleware: all student routes require role 'student'
router.use(requireAuth, requireRole('student'));

// Helper to resolve authenticated student record (Hard-locked to own user ID)
function getAuthStudent(userId: string) {
  return memDb.students.find(s => s.user_id === userId);
}

// 1. Get My Profile
router.get('/profile', (req: AuthRequest, res) => {
  const student = getAuthStudent(req.user!.id);
  if (!student) return res.status(404).json({ error: 'Student record not found.' });

  const user = memDb.users.find(u => u.id === req.user!.id);
  const cls = memDb.classes.find(c => c.id === student.class_id);
  const dept = memDb.departments.find(d => d.id === student.department_id);
  const latestResume = memDb.student_documents.find(d => d.student_id === student.id && d.doc_type === 'resume');

  const marksCount = memDb.marks.filter(m => m.student_id === student.id).length;
  const projectsCount = memDb.projects.filter(p => p.student_id === student.id).length;
  const achievementsCount = memDb.achievements.filter(a => a.student_id === student.id).length;
  const certificationsCount = memDb.certifications.filter(c => c.student_id === student.id).length;

  // Compute live profile strength score
  const strength = calculateProfileStrength({
    profile_photo_url: student.profile_photo_url,
    resume_url: student.resume_url,
    linkedin_url: student.linkedin_url,
    github_url: student.github_url,
    bio: student.bio,
    has_marks: marksCount > 0,
    projects_count: projectsCount,
    achievements_count: achievementsCount,
    certifications_count: certificationsCount
  });

  student.profile_strength = strength;

  res.json({
    id: student.id,
    roll_number: student.roll_number,
    full_name: user ? user.full_name : '',
    email: user ? user.email : '',
    className: cls ? cls.name : '',
    classYear: cls ? cls.year : '',
    classSection: cls ? cls.section : '',
    departmentName: dept ? dept.name : '',
    linkedin_url: student.linkedin_url || '',
    github_url: student.github_url || '',
    profile_photo_url: student.profile_photo_url || '',
    resume_url: student.resume_url || '',
    bio: student.bio || '',
    profile_strength: strength,
    resumeDocument: latestResume || null
  });
});

// 2. Update Profile (Bio, LinkedIn, GitHub with URL validation)
router.put('/profile', (req: AuthRequest, res) => {
  const student = getAuthStudent(req.user!.id);
  if (!student) return res.status(404).json({ error: 'Student record not found.' });

  const { bio, linkedin_url, github_url } = req.body;

  // Validation
  if (linkedin_url && linkedin_url.trim() !== '') {
    if (!/^https?:\/\/(www\.)?linkedin\.com\/.+/i.test(linkedin_url.trim())) {
      return res.status(400).json({ error: 'Please enter a valid LinkedIn profile URL (e.g. https://linkedin.com/in/username).' });
    }
  }

  if (github_url && github_url.trim() !== '') {
    if (!/^https?:\/\/(www\.)?github\.com\/.+/i.test(github_url.trim())) {
      return res.status(400).json({ error: 'Please enter a valid GitHub profile URL (e.g. https://github.com/username).' });
    }
  }

  student.bio = typeof bio === 'string' ? bio.trim() : student.bio;
  student.linkedin_url = linkedin_url !== undefined ? linkedin_url.trim() : student.linkedin_url;
  student.github_url = github_url !== undefined ? github_url.trim() : student.github_url;

  const marksCount = memDb.marks.filter(m => m.student_id === student.id).length;
  student.profile_strength = calculateProfileStrength({
    profile_photo_url: student.profile_photo_url,
    resume_url: student.resume_url,
    linkedin_url: student.linkedin_url,
    github_url: student.github_url,
    bio: student.bio,
    has_marks: marksCount > 0
  });

  res.json({
    message: 'Profile updated successfully',
    student: {
      bio: student.bio,
      linkedin_url: student.linkedin_url,
      github_url: student.github_url,
      profile_strength: student.profile_strength
    }
  });
});

// 3. Upload Profile Photo
router.post('/upload-photo', (req: AuthRequest, res) => {
  const student = getAuthStudent(req.user!.id);
  if (!student) return res.status(404).json({ error: 'Student record not found.' });

  const { photo_data_url } = req.body;
  if (!photo_data_url) {
    return res.status(400).json({ error: 'Photo data is required.' });
  }

  student.profile_photo_url = photo_data_url;
  const marksCount = memDb.marks.filter(m => m.student_id === student.id).length;
  student.profile_strength = calculateProfileStrength({
    profile_photo_url: student.profile_photo_url,
    resume_url: student.resume_url,
    linkedin_url: student.linkedin_url,
    github_url: student.github_url,
    bio: student.bio,
    has_marks: marksCount > 0
  });

  res.json({
    message: 'Profile photo updated successfully',
    profile_photo_url: student.profile_photo_url,
    profile_strength: student.profile_strength
  });
});

// 4. Upload Resume & Automatic Section Parser
router.post('/upload-resume', (req: AuthRequest, res) => {
  const student = getAuthStudent(req.user!.id);
  if (!student) return res.status(404).json({ error: 'Student record not found.' });

  const { file_name, file_text, file_url } = req.body;
  const filename = file_name || 'Resume.pdf';

  // Run automated section heading scanner
  const parsedHeadings = parseResumeContent(file_text || '', filename);

  const newDoc: StudentDocumentRecord = {
    id: `doc_${Date.now()}`,
    student_id: student.id,
    title: filename,
    category: 'Resume',
    doc_type: 'resume',
    file_url: file_url || `/uploads/resumes/${student.roll_number}_${Date.now()}.pdf`,
    file_name: filename,
    parsed_headings: parsedHeadings,
    status: 'processed',
    created_at: new Date().toISOString()
  };

  // Replace previous resume document or add
  const prevIdx = memDb.student_documents.findIndex(d => d.student_id === student.id && d.doc_type === 'resume');
  if (prevIdx !== -1) {
    memDb.student_documents[prevIdx] = newDoc;
  } else {
    memDb.student_documents.push(newDoc);
  }

  student.resume_url = newDoc.file_url;
  const marksCount = memDb.marks.filter(m => m.student_id === student.id).length;
  student.profile_strength = calculateProfileStrength({
    profile_photo_url: student.profile_photo_url,
    resume_url: student.resume_url,
    linkedin_url: student.linkedin_url,
    github_url: student.github_url,
    bio: student.bio,
    has_marks: marksCount > 0
  });

  res.json({
    message: 'Resume scanned and parsed successfully',
    document: newDoc,
    profile_strength: student.profile_strength
  });
});

// 5. Academic Records & SGPA/CGPA Trend
router.get('/marks', (req: AuthRequest, res) => {
  const student = getAuthStudent(req.user!.id);
  if (!student) return res.status(404).json({ error: 'Student record not found.' });

  const marks = memDb.marks.filter(m => m.student_id === student.id);
  const marksheets = memDb.marksheets.filter(m => m.student_id === student.id);

  // Group marks by semester
  const semesterMap: Record<string, any> = {};

  for (const m of marks) {
    if (!semesterMap[m.semester_id]) {
      const sem = memDb.semesters.find(s => s.id === m.semester_id);
      semesterMap[m.semester_id] = {
        semester_id: m.semester_id,
        semester_name: sem ? sem.name : m.semester_id,
        subjects: {}
      };
    }

    if (!semesterMap[m.semester_id].subjects[m.subject_id]) {
      const sub = memDb.subjects.find(s => s.id === m.subject_id);
      semesterMap[m.semester_id].subjects[m.subject_id] = {
        subject_id: m.subject_id,
        subject_name: sub ? sub.name : m.subject_id,
        subject_code: sub ? sub.code : '',
        marks: []
      };
    }

    semesterMap[m.semester_id].subjects[m.subject_id].marks.push({
      exam_type: m.exam_type,
      marks_obtained: m.marks_obtained,
      max_marks: m.max_marks,
      percentage: Number(((m.marks_obtained / m.max_marks) * 100).toFixed(1))
    });
  }

  // CGPA & SGPA trend across completed semesters
  const cgpaTrend = marksheets.map(ms => {
    const sem = memDb.semesters.find(s => s.id === ms.semester_id);
    return {
      semesterId: ms.semester_id,
      semesterName: sem ? sem.name : ms.semester_id,
      sgpa: ms.sgpa,
      cgpa: ms.cgpa,
      fileUrl: ms.file_url,
      fileName: ms.file_name
    };
  });

  res.json({
    semestersData: Object.values(semesterMap),
    cgpaTrend,
    officialMarksheets: marksheets
  });
});

router.get('/marksheets/:marksheetId/file', (req: AuthRequest, res) => {
  const student = getAuthStudent(req.user!.id);
  const marksheet = student
    ? memDb.marksheets.find(m => m.id === req.params.marksheetId && m.student_id === student.id)
    : undefined;
  if (!marksheet) return res.status(404).json({ error: 'Marksheet not found.' });

  const storedName = path.basename(marksheet.file_url);
  const fileName = storedName === 'file'
    ? fs.readdirSync(marksheetDir).find(name => name.toLowerCase().endsWith(marksheet.file_name.toLowerCase()))
    : storedName;
  if (!fileName) return res.status(404).json({ error: 'Marksheet file is unavailable.' });
  const filePath = path.join(marksheetDir, fileName);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Marksheet file is unavailable.' });

  res.type('application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${marksheet.file_name}"`);
  res.sendFile(filePath);
});

// 6. Notifications (Targeted to student, all, or student's class)
router.get('/notifications', (req: AuthRequest, res) => {
  const student = getAuthStudent(req.user!.id);
  const classId = student ? student.class_id : null;
  const userId = req.user!.id;

  const relevant = memDb.notifications.filter(n => {
    if (n.target_role === 'all') return true;
    if (n.target_role === 'all_students') return true;
    if (n.target_role === 'class' && n.target_class_id === classId) return true;
    return false;
  });

  const withReadStatus = relevant.map(n => {
    const isRead = memDb.notification_reads.some(r => r.notification_id === n.id && r.user_id === userId);
    return {
      ...n,
      is_read: isRead
    };
  });

  res.json(withReadStatus);
});

// Mark single notification as read
router.post('/notifications/:id/read', (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const notifId = req.params.id;

  const existing = memDb.notification_reads.find(r => r.notification_id === notifId && r.user_id === userId);
  if (!existing) {
    memDb.notification_reads.push({
      id: `nr_${Date.now()}`,
      notification_id: notifId,
      user_id: userId,
      read_at: new Date().toISOString()
    });
  }

  res.json({ message: 'Marked as read' });
});

// Mark all as read
router.post('/notifications/read-all', (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const student = getAuthStudent(userId);
  const classId = student ? student.class_id : null;

  const relevant = memDb.notifications.filter(n => {
    return n.target_role === 'all' || n.target_role === 'all_students' || (n.target_role === 'class' && n.target_class_id === classId);
  });

  for (const n of relevant) {
    if (!memDb.notification_reads.some(r => r.notification_id === n.id && r.user_id === userId)) {
      memDb.notification_reads.push({
        id: `nr_${Date.now()}_${n.id}`,
        notification_id: n.id,
        user_id: userId,
        read_at: new Date().toISOString()
      });
    }
  }

  res.json({ message: 'All notifications marked as read' });
});

// 7. Student Document Vault (Upload, List, Delete)
router.get('/documents', (req: AuthRequest, res) => {
  const student = getAuthStudent(req.user!.id);
  if (!student) return res.status(404).json({ error: 'Student record not found.' });

  const docs = memDb.student_documents.filter(d => d.student_id === student.id);
  res.json(docs);
});

router.post('/documents', (req: AuthRequest, res) => {
  const student = getAuthStudent(req.user!.id);
  if (!student) return res.status(404).json({ error: 'Student record not found.' });

  const { title, description, category, file_name, file_url } = req.body;
  if (!title || !category || !file_name) {
    return res.status(400).json({ error: 'Title, category, and file are required.' });
  }

  const newDoc: StudentDocumentRecord = {
    id: `doc_${Date.now()}`,
    student_id: student.id,
    title: String(title).trim(),
    description: description ? String(description).trim() : '',
    category: category || 'Other',
    doc_type: (file_name.split('.').pop() || 'doc').toLowerCase(),
    file_url: file_url || `/uploads/documents/${student.roll_number}_${Date.now()}_${file_name}`,
    file_name,
    status: 'processed',
    created_at: new Date().toISOString()
  };

  memDb.student_documents.unshift(newDoc);
  res.status(201).json({ message: 'Document uploaded successfully', document: newDoc });
});

router.delete('/documents/:id', (req: AuthRequest, res) => {
  const student = getAuthStudent(req.user!.id);
  if (!student) return res.status(404).json({ error: 'Student record not found.' });

  const index = memDb.student_documents.findIndex(d => d.id === req.params.id && d.student_id === student.id);
  if (index === -1) return res.status(404).json({ error: 'Document not found or unauthorized' });

  memDb.student_documents.splice(index, 1);
  res.json({ message: 'Document removed successfully' });
});

// 8. Projects (CRUD)
router.get('/projects', (req: AuthRequest, res) => {
  const student = getAuthStudent(req.user!.id);
  if (!student) return res.status(404).json({ error: 'Student record not found.' });

  const list = memDb.projects.filter(p => p.student_id === student.id);
  res.json(list);
});

router.post('/projects', (req: AuthRequest, res) => {
  const student = getAuthStudent(req.user!.id);
  if (!student) return res.status(404).json({ error: 'Student record not found.' });

  const { title, description, technologies, github_url, live_url, date, team_members, image_url } = req.body;
  if (!title || !description) {
    return res.status(400).json({ error: 'Project title and description are required.' });
  }

  const newProject = {
    id: `proj_${Date.now()}`,
    student_id: student.id,
    title: String(title).trim(),
    description: String(description).trim(),
    technologies: Array.isArray(technologies) ? technologies : String(technologies || '').split(',').map(t => t.trim()).filter(Boolean),
    github_url: github_url ? String(github_url).trim() : '',
    live_url: live_url ? String(live_url).trim() : '',
    date: date || new Date().toISOString().split('T')[0],
    team_members: Array.isArray(team_members) ? team_members : String(team_members || '').split(',').map(m => m.trim()).filter(Boolean),
    image_url: image_url || '',
    created_at: new Date().toISOString()
  };

  memDb.projects.unshift(newProject);
  res.status(201).json({ message: 'Project created successfully', project: newProject });
});

router.put('/projects/:id', (req: AuthRequest, res) => {
  const student = getAuthStudent(req.user!.id);
  if (!student) return res.status(404).json({ error: 'Student record not found.' });

  const project = memDb.projects.find(p => p.id === req.params.id && p.student_id === student.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { title, description, technologies, github_url, live_url, date, team_members, image_url } = req.body;
  if (title) project.title = String(title).trim();
  if (description) project.description = String(description).trim();
  if (technologies !== undefined) {
    project.technologies = Array.isArray(technologies) ? technologies : String(technologies).split(',').map(t => t.trim()).filter(Boolean);
  }
  if (github_url !== undefined) project.github_url = String(github_url).trim();
  if (live_url !== undefined) project.live_url = String(live_url).trim();
  if (date !== undefined) project.date = date;
  if (team_members !== undefined) {
    project.team_members = Array.isArray(team_members) ? team_members : String(team_members).split(',').map(m => m.trim()).filter(Boolean);
  }
  if (image_url !== undefined) project.image_url = image_url;

  res.json({ message: 'Project updated successfully', project });
});

router.delete('/projects/:id', (req: AuthRequest, res) => {
  const student = getAuthStudent(req.user!.id);
  if (!student) return res.status(404).json({ error: 'Student record not found.' });

  const index = memDb.projects.findIndex(p => p.id === req.params.id && p.student_id === student.id);
  if (index === -1) return res.status(404).json({ error: 'Project not found' });

  memDb.projects.splice(index, 1);
  res.json({ message: 'Project removed successfully' });
});

// 9. Achievements (CRUD)
router.get('/achievements', (req: AuthRequest, res) => {
  const student = getAuthStudent(req.user!.id);
  if (!student) return res.status(404).json({ error: 'Student record not found.' });

  const list = memDb.achievements.filter(a => a.student_id === student.id);
  res.json(list);
});

router.post('/achievements', (req: AuthRequest, res) => {
  const student = getAuthStudent(req.user!.id);
  if (!student) return res.status(404).json({ error: 'Student record not found.' });

  const { title, description, organization, date, link, certificate_url } = req.body;
  if (!title || !description || !organization) {
    return res.status(400).json({ error: 'Title, description, and issuing organization are required.' });
  }

  const newAch = {
    id: `ach_${Date.now()}`,
    student_id: student.id,
    title: String(title).trim(),
    description: String(description).trim(),
    organization: String(organization).trim(),
    date: date || new Date().toISOString().split('T')[0],
    link: link ? String(link).trim() : '',
    certificate_url: certificate_url || '',
    created_at: new Date().toISOString()
  };

  memDb.achievements.unshift(newAch);
  res.status(201).json({ message: 'Achievement recorded successfully', achievement: newAch });
});

router.delete('/achievements/:id', (req: AuthRequest, res) => {
  const student = getAuthStudent(req.user!.id);
  if (!student) return res.status(404).json({ error: 'Student record not found.' });

  const index = memDb.achievements.findIndex(a => a.id === req.params.id && a.student_id === student.id);
  if (index === -1) return res.status(404).json({ error: 'Achievement not found' });

  memDb.achievements.splice(index, 1);
  res.json({ message: 'Achievement deleted successfully' });
});

// 10. Certifications (CRUD)
router.get('/certifications', (req: AuthRequest, res) => {
  const student = getAuthStudent(req.user!.id);
  if (!student) return res.status(404).json({ error: 'Student record not found.' });

  const list = memDb.certifications.filter(c => c.student_id === student.id);
  res.json(list);
});

router.post('/certifications', (req: AuthRequest, res) => {
  const student = getAuthStudent(req.user!.id);
  if (!student) return res.status(404).json({ error: 'Student record not found.' });

  const { name, issuer, issue_date, credential_id, credential_url, certificate_url } = req.body;
  if (!name || !issuer) {
    return res.status(400).json({ error: 'Certificate name and issuer are required.' });
  }

  const newCert = {
    id: `cert_${Date.now()}`,
    student_id: student.id,
    name: String(name).trim(),
    issuer: String(issuer).trim(),
    issue_date: issue_date || new Date().toISOString().split('T')[0],
    credential_id: credential_id ? String(credential_id).trim() : '',
    credential_url: credential_url ? String(credential_url).trim() : '',
    certificate_url: certificate_url || '',
    created_at: new Date().toISOString()
  };

  memDb.certifications.unshift(newCert);
  res.status(201).json({ message: 'Certification added successfully', certification: newCert });
});

router.delete('/certifications/:id', (req: AuthRequest, res) => {
  const student = getAuthStudent(req.user!.id);
  if (!student) return res.status(404).json({ error: 'Student record not found.' });

  const index = memDb.certifications.findIndex(c => c.id === req.params.id && c.student_id === student.id);
  if (index === -1) return res.status(404).json({ error: 'Certification not found' });

  memDb.certifications.splice(index, 1);
  res.json({ message: 'Certification deleted successfully' });
});

// 11. Hackathons (CRUD)
router.get('/hackathons', (req: AuthRequest, res) => {
  const student = getAuthStudent(req.user!.id);
  if (!student) return res.status(404).json({ error: 'Student record not found.' });

  const list = memDb.hackathons.filter(h => h.student_id === student.id);
  res.json(list);
});

router.post('/hackathons', (req: AuthRequest, res) => {
  const student = getAuthStudent(req.user!.id);
  if (!student) return res.status(404).json({ error: 'Student record not found.' });

  const {
    name,
    organizer,
    date,
    position_result,
    team_name,
    project_name,
    project_description,
    github_url,
    demo_url,
    certificate_url
  } = req.body;

  if (!name || !organizer) {
    return res.status(400).json({ error: 'Hackathon name and organizer are required.' });
  }

  const newHack = {
    id: `hack_${Date.now()}`,
    student_id: student.id,
    name: String(name).trim(),
    organizer: String(organizer).trim(),
    date: date || new Date().toISOString().split('T')[0],
    position_result: position_result ? String(position_result).trim() : 'Participant',
    team_name: team_name ? String(team_name).trim() : '',
    project_name: project_name ? String(project_name).trim() : '',
    project_description: project_description ? String(project_description).trim() : '',
    github_url: github_url ? String(github_url).trim() : '',
    demo_url: demo_url ? String(demo_url).trim() : '',
    certificate_url: certificate_url || '',
    created_at: new Date().toISOString()
  };

  memDb.hackathons.unshift(newHack);
  res.status(201).json({ message: 'Hackathon entry saved', hackathon: newHack });
});

router.delete('/hackathons/:id', (req: AuthRequest, res) => {
  const student = getAuthStudent(req.user!.id);
  if (!student) return res.status(404).json({ error: 'Student record not found.' });

  const index = memDb.hackathons.findIndex(h => h.id === req.params.id && h.student_id === student.id);
  if (index === -1) return res.status(404).json({ error: 'Hackathon entry not found' });

  memDb.hackathons.splice(index, 1);
  res.json({ message: 'Hackathon entry deleted' });
});

// 12. College Events & Hackathons (Admin posted)
router.get('/events', (req: AuthRequest, res) => {
  res.json(memDb.events);
});

// 13. AI Query Assistant for Students (Strictly locked to own student data)
router.post('/ai-query', rateLimit(25, 60 * 1000, 'student-ai'), async (req: AuthRequest, res) => {
  const { query: queryText } = req.body;
  if (!queryText || !queryText.trim()) {
    return res.status(400).json({ error: 'Query text is required.' });
  }

  const result = await processAiQuery(req.user!, queryText.trim());

  // Log to audit table
  memDb.ai_query_logs.push({
    id: `log_${Date.now()}`,
    user_id: req.user!.id,
    query_text: queryText.trim(),
    resolved_intent: result.resolvedIntent,
    response_summary: result.text.slice(0, 300),
    tool_calls: result.toolCallsExecuted,
    created_at: new Date().toISOString()
  });

  res.json({
    answer: result.text,
    toolCallsExecuted: result.toolCallsExecuted,
    resolvedIntent: result.resolvedIntent
  });
});

export default router;
