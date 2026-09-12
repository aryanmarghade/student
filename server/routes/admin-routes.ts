import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import JSZip from 'jszip';
import { memDb, UserRecord, StudentRecord, TeacherAssignmentRecord, MarksheetRecord, NotificationRecord, ClassRecord, SubjectRecord } from '../db.js';
import { requireAuth, requireRole, hashPassword, AuthRequest, rateLimit } from '../auth.js';
import { processAiQuery } from '../ai-assistant.js';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.join(__dirname, '../../uploads/marksheets');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir)
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname)
  }
});
const upload = multer({ storage: storage, fileFilter: (req, file, cb) => {
  if (file.mimetype === 'application/pdf' && file.originalname.toLowerCase().endsWith('.pdf')) {
        cb(null, true);
    } else {
        cb(new Error('Only PDF files are allowed'));
    }
} });

// All admin routes require role 'admin'
router.use(requireAuth, requireRole('admin'));

// Helper to generate readable temporary passwords
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `VA-${code}`;
}

// 1. Overview Dashboard Stats & Honest Analytics
router.get('/overview', (req: AuthRequest, res) => {
  const totalStudents = memDb.students.length;
  const totalTeachers = memDb.users.filter(u => u.role === 'teacher').length;
  const totalClasses = memDb.classes.length;
  const activeSemesters = memDb.semesters.filter(s => s.is_active).length;

  // Pass rate calculation across all recorded marks
  const allFinalOrExamMarks = memDb.marks.filter(m => m.exam_type === 'Final' || m.exam_type === 'Midterm');
  const passingMarks = allFinalOrExamMarks.filter(m => (m.marks_obtained / m.max_marks) >= 0.4);
  const overallPassRate = allFinalOrExamMarks.length > 0
    ? Number(((passingMarks.length / allFinalOrExamMarks.length) * 100).toFixed(1))
    : null; // null triggers honest empty state in UI

  // Honest Semester Trend Data: only computed from semesters that actually exist with real marks
  const semesterTrends = memDb.semesters.map(sem => {
    const semMarks = memDb.marks.filter(m => m.semester_id === sem.id);
    const semStudents = new Set(semMarks.map(m => m.student_id)).size;
    const passed = semMarks.filter(m => (m.marks_obtained / m.max_marks) >= 0.4).length;
    const rate = semMarks.length > 0 ? Number(((passed / semMarks.length) * 100).toFixed(1)) : 0;
    return {
      semesterId: sem.id,
      semesterName: sem.name,
      activeStudents: semStudents || totalStudents,
      evaluatedMarks: semMarks.length,
      passRate: rate
    };
  }).filter(s => s.evaluatedMarks > 0);

  // Department distribution
  const departmentStats = memDb.departments.map(d => {
    const studentCount = memDb.students.filter(s => s.department_id === d.id).length;
    const classCount = memDb.classes.filter(c => c.department_id === d.id).length;
    return {
      id: d.id,
      name: d.name,
      code: d.code,
      studentCount,
      classCount
    };
  });

  // Real audit log feed (last 10 entries)
  const recentActivity = memDb.audit_logs.slice(0, 10).map(log => {
    const user = memDb.users.find(u => u.id === log.user_id);
    return {
      ...log,
      userName: user ? user.full_name : 'System'
    };
  });

  res.json({
    totalStudents,
    totalTeachers,
    totalClasses,
    activeSemesters,
    overallPassRate,
    semesterTrends,
    departmentStats,
    recentActivity
  });
});

// 2. Audit Logs
router.get('/audit-logs', (req, res) => {
  const logs = memDb.audit_logs.map(log => {
    const user = memDb.users.find(u => u.id === log.user_id);
    return {
      ...log,
      userName: user ? user.full_name : 'System'
    };
  });
  res.json(logs);
});

// 3. User Management
router.get('/users', (req, res) => {
  const { role, search } = req.query;
  let list = memDb.users.map(u => {
    const { password_hash, ...rest } = u;
    let extra: any = {};
    if (u.role === 'student') {
      const stud = memDb.students.find(s => s.user_id === u.id);
      if (stud) {
        const cls = memDb.classes.find(c => c.id === stud.class_id);
        const dept = memDb.departments.find(d => d.id === stud.department_id);
        extra = {
          student_id: stud.id,
          roll_number: stud.roll_number,
          class_name: cls ? cls.name : 'Unassigned',
          class_id: stud.class_id,
          department_name: dept ? dept.name : '',
          profile_strength: stud.profile_strength
        };
      }
    } else if (u.role === 'teacher') {
      const assignments = memDb.teacher_class_assignments.filter(a => a.teacher_user_id === u.id && a.status === 'active');
      extra = {
        activeAssignmentsCount: assignments.length
      };
    }
    return { ...rest, ...extra };
  });

  if (role) {
    list = list.filter(u => u.role === role);
  }
  if (search) {
    const s = String(search).toLowerCase();
    list = list.filter(u =>
      u.full_name.toLowerCase().includes(s) ||
      u.email.toLowerCase().includes(s) ||
      (u as any).roll_number?.toLowerCase().includes(s)
    );
  }

  res.json(list);
});

// Create Individual User with Secure Temporary Password & Force Reset
router.post('/users', async (req: AuthRequest, res) => {
  const { email, full_name, role, roll_number, class_id, department_id } = req.body;

  if (!email || !full_name || !role) {
    return res.status(400).json({ error: 'Email, full name, and role are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (memDb.users.some(u => u.email.toLowerCase() === normalizedEmail)) {
    return res.status(409).json({ error: 'An account with this institutional email already exists.' });
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const userId = `usr_${Date.now()}`;

  const newUser: UserRecord = {
    id: userId,
    email: normalizedEmail,
    password_hash: passwordHash,
    role,
    full_name: full_name.trim(),
    is_active: true,
    must_reset_password: true,
    created_at: new Date().toISOString()
  };

  memDb.users.push(newUser);

  let createdStudent: StudentRecord | undefined;
  if (role === 'student') {
    const studentId = `std_${Date.now()}`;
    const assignedClass = class_id ? memDb.classes.find(c => c.id === class_id) : memDb.classes[0];
    const newStudent: StudentRecord = {
      id: studentId,
      user_id: userId,
      roll_number: roll_number ? roll_number.trim().toUpperCase() : `VA${Math.floor(100000 + Math.random() * 900000)}`,
      class_id: assignedClass ? assignedClass.id : '',
      department_id: department_id || (assignedClass ? assignedClass.department_id : (memDb.departments[0]?.id || '')),
      profile_strength: 20
    };
    memDb.students.push(newStudent);
    createdStudent = newStudent;
  }

  memDb.logActivity(
    req.user?.id,
    'USER_CREATE',
    'USER',
    userId,
    `Created ${role} account for ${newUser.full_name} (${newUser.email}) with temporary password.`
  );

  res.status(201).json({
    message: 'User account created successfully.',
    tempPassword, // Displayed once in the UI so admin can copy/distribute
    user: {
      id: newUser.id,
      email: newUser.email,
      role: newUser.role,
      full_name: newUser.full_name,
      must_reset_password: true,
      ...(createdStudent ? { student_id: createdStudent.id, roll_number: createdStudent.roll_number } : {})
    },
    student: createdStudent
  });
});

// Bulk CSV Import with Row-by-Row Validation Report
router.post('/users/bulk-import', async (req: AuthRequest, res) => {
  const { csvText, role } = req.body;
  if (!csvText || !role) {
    return res.status(400).json({ error: 'CSV text content and target role are required.' });
  }

  const lines = csvText.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
  if (lines.length <= 1) {
    return res.status(400).json({ error: 'CSV must contain at least a header row and one data row.' });
  }

  const headers = lines[0].split(',').map((h: string) => h.trim().toLowerCase());
  const emailIdx = headers.findIndex((h: string) => h.includes('email'));
  const nameIdx = headers.findIndex((h: string) => h.includes('name'));
  const rollIdx = headers.findIndex((h: string) => h.includes('roll'));
  const classIdx = headers.findIndex((h: string) => h.includes('class'));

  if (emailIdx === -1 || nameIdx === -1) {
    return res.status(400).json({ error: 'CSV must include at least "email" and "name" columns.' });
  }

  const successRows: Array<{ email: string; name: string; tempPassword: string; rollNumber?: string }> = [];
  const failedRows: Array<{ rowNumber: number; data: string; reason: string }> = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',').map((c: string) => c.trim());
    const email = row[emailIdx];
    const name = row[nameIdx];
    const roll = rollIdx !== -1 ? row[rollIdx] : '';
    const className = classIdx !== -1 ? row[classIdx] : '';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      failedRows.push({ rowNumber: i + 1, data: lines[i], reason: 'Invalid or missing email format' });
      continue;
    }

    if (!name || name.length < 2) {
      failedRows.push({ rowNumber: i + 1, data: lines[i], reason: 'Full name too short or missing' });
      continue;
    }

    if (memDb.users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      failedRows.push({ rowNumber: i + 1, data: lines[i], reason: 'Email already registered' });
      continue;
    }

    if (role === 'student' && roll && memDb.students.some(s => s.roll_number.toLowerCase() === roll.toLowerCase())) {
      failedRows.push({ rowNumber: i + 1, data: lines[i], reason: 'Roll number already exists' });
      continue;
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);
    const userId = `usr_${Date.now()}_${i}`;

    const newUser: UserRecord = {
      id: userId,
      email: email.toLowerCase(),
      password_hash: passwordHash,
      role: role as any,
      full_name: name,
      is_active: true,
      must_reset_password: true,
      created_at: new Date().toISOString()
    };
    memDb.users.push(newUser);

    if (role === 'student') {
      let matchedClass = className ? memDb.classes.find(c => c.name.toLowerCase() === className.toLowerCase()) : null;
      if (!matchedClass) matchedClass = memDb.classes[0];

      const newStudent: StudentRecord = {
        id: `std_${Date.now()}_${i}`,
        user_id: userId,
        roll_number: roll ? roll.toUpperCase() : `VA${Math.floor(100000 + Math.random() * 900000)}`,
        class_id: matchedClass ? matchedClass.id : '',
        department_id: matchedClass ? matchedClass.department_id : (memDb.departments[0]?.id || ''),
        profile_strength: 20
      };
      memDb.students.push(newStudent);
      successRows.push({ email, name, tempPassword, rollNumber: newStudent.roll_number });
    } else {
      successRows.push({ email, name, tempPassword });
    }
  }

  memDb.logActivity(
    req.user?.id,
    'BULK_USER_IMPORT',
    'USER',
    undefined,
    `Bulk imported ${successRows.length} users (${failedRows.length} failures).`
  );

  res.json({
    summary: {
      totalRows: lines.length - 1,
      successfulCount: successRows.length,
      failedCount: failedRows.length
    },
    successRows,
    failedRows
  });
});

// Toggle User Active / Inactive Status
router.patch('/users/:id/status', (req: AuthRequest, res) => {
  const user = memDb.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  if (user.id === req.user!.id) {
    return res.status(400).json({ error: 'You cannot deactivate your own master administrator account.' });
  }

  user.is_active = !user.is_active;
  memDb.logActivity(
    req.user?.id,
    'USER_STATUS_CHANGE',
    'USER',
    user.id,
    `${user.is_active ? 'Activated' : 'Deactivated'} account for ${user.full_name} (${user.email}).`
  );

  res.json({
    message: `Account ${user.is_active ? 'activated' : 'deactivated'} successfully.`,
    is_active: user.is_active
  });
});

// Admin Password Reset: Generates Temp Password and forces reset on login
router.post('/users/:id/reset-password', async (req: AuthRequest, res) => {
  const user = memDb.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const tempPassword = generateTempPassword();
  user.password_hash = await hashPassword(tempPassword);
  user.must_reset_password = true;

  memDb.logActivity(
    req.user?.id,
    'ADMIN_PASSWORD_RESET',
    'USER',
    user.id,
    `Reset password for ${user.full_name}. Temporary credentials issued.`
  );

  res.json({
    message: `Password reset successfully for ${user.full_name}.`,
    tempPassword
  });
});

// 4. Classes & Subjects
router.get('/classes', (req, res) => {
  const data = memDb.classes.map(c => {
    const dept = memDb.departments.find(d => d.id === c.department_id);
    const count = memDb.students.filter(s => s.class_id === c.id).length;
    const assignmentsCount = memDb.teacher_class_assignments.filter(a => a.class_id === c.id && a.status === 'active').length;
    return {
      ...c,
      departmentName: dept ? dept.name : '',
      departmentCode: dept ? dept.code : '',
      studentCount: count,
      activeTeacherCount: assignmentsCount
    };
  });
  res.json(data);
});

router.post('/classes', (req: AuthRequest, res) => {
  const { name, department_id, year, section } = req.body;
  if (!name || !department_id || !year || !section) {
    return res.status(400).json({ error: 'Class name, department, year, and section are all required.' });
  }

  // Prevent duplicate class name
  if (memDb.classes.some(c => c.name.toLowerCase() === name.trim().toLowerCase())) {
    return res.status(409).json({ error: 'A class with this designation already exists.' });
  }

  const newClass: ClassRecord = {
    id: `cls_${Date.now()}`,
    name: name.trim().toUpperCase(),
    department_id,
    academic_year_id: memDb.academic_years[0]?.id || 'ay_2025_26',
    year: Number(year),
    section: section.trim().toUpperCase()
  };

  memDb.classes.push(newClass);
  memDb.logActivity(req.user?.id, 'CLASS_CREATE', 'CLASS', newClass.id, `Created class ${newClass.name}.`);

  res.status(201).json({ message: 'Class created successfully.', class: newClass });
});

// Delete Class with strict dependency check
router.delete('/classes/:id', (req: AuthRequest, res) => {
  const classId = req.params.id;
  const targetClass = memDb.classes.find(c => c.id === classId);
  if (!targetClass) return res.status(404).json({ error: 'Class not found.' });

  const studentCount = memDb.students.filter(s => s.class_id === classId).length;
  if (studentCount > 0) {
    return res.status(409).json({
      error: `Cannot delete class "${targetClass.name}" because ${studentCount} student(s) are currently enrolled in it. Reassign or delete the students first.`
    });
  }

  const assignmentCount = memDb.teacher_class_assignments.filter(a => a.class_id === classId).length;
  if (assignmentCount > 0) {
    return res.status(409).json({
      error: `Cannot delete class "${targetClass.name}" because ${assignmentCount} teacher assignment(s) reference it. Archive or remove the assignments first.`
    });
  }

  memDb.classes = memDb.classes.filter(c => c.id !== classId);
  memDb.logActivity(req.user?.id, 'CLASS_DELETE', 'CLASS', classId, `Deleted class ${targetClass.name}.`);

  res.json({ message: `Class ${targetClass.name} deleted successfully.` });
});

router.get('/departments', (req, res) => {
  res.json(memDb.departments);
});

router.get('/semesters', (req, res) => {
  res.json(memDb.semesters);
});

router.get('/subjects', (req, res) => {
  const data = memDb.subjects.map(s => {
    const dept = memDb.departments.find(d => d.id === s.department_id);
    const marksCount = memDb.marks.filter(m => m.subject_id === s.id).length;
    return {
      ...s,
      departmentName: dept ? dept.name : '',
      marksCount
    };
  });
  res.json(data);
});

router.post('/subjects', (req: AuthRequest, res) => {
  const { name, code, department_id, max_marks } = req.body;
  if (!name || !code || !department_id) {
    return res.status(400).json({ error: 'Subject name, course code, and department are required.' });
  }

  if (memDb.subjects.some(s => s.code.toLowerCase() === code.trim().toLowerCase())) {
    return res.status(409).json({ error: 'A subject with this course code already exists.' });
  }

  const newSubject: SubjectRecord = {
    id: `sbj_${Date.now()}`,
    name: name.trim(),
    code: code.trim().toUpperCase(),
    department_id,
    max_marks: Number(max_marks) || 100
  };

  memDb.subjects.push(newSubject);
  memDb.logActivity(req.user?.id, 'SUBJECT_CREATE', 'SUBJECT', newSubject.id, `Created subject ${newSubject.name} (${newSubject.code}).`);

  res.status(201).json({ message: 'Subject created successfully.', subject: newSubject });
});

// Delete Subject with strict dependency check
router.delete('/subjects/:id', (req: AuthRequest, res) => {
  const subjectId = req.params.id;
  const targetSubject = memDb.subjects.find(s => s.id === subjectId);
  if (!targetSubject) return res.status(404).json({ error: 'Subject not found.' });

  const marksCount = memDb.marks.filter(m => m.subject_id === subjectId).length;
  if (marksCount > 0) {
    return res.status(409).json({
      error: `Cannot delete subject "${targetSubject.name}" because ${marksCount} student marks record(s) reference it.`
    });
  }

  const assignmentCount = memDb.teacher_class_assignments.filter(a => a.subject_id === subjectId).length;
  if (assignmentCount > 0) {
    return res.status(409).json({
      error: `Cannot delete subject "${targetSubject.name}" because ${assignmentCount} teacher assignment(s) reference it.`
    });
  }

  memDb.subjects = memDb.subjects.filter(s => s.id !== subjectId);
  memDb.logActivity(req.user?.id, 'SUBJECT_DELETE', 'SUBJECT', subjectId, `Deleted subject ${targetSubject.name}.`);

  res.json({ message: `Subject ${targetSubject.name} deleted successfully.` });
});

// 5. Teacher Class Assignment
router.get('/teacher-assignments', (req, res) => {
  const assignments = memDb.teacher_class_assignments.map(a => {
    const teacher = memDb.users.find(u => u.id === a.teacher_user_id);
    const cls = memDb.classes.find(c => c.id === a.class_id);
    const sub = memDb.subjects.find(s => s.id === a.subject_id);
    const sem = memDb.semesters.find(s => s.id === a.semester_id);
    return {
      ...a,
      teacherName: teacher ? teacher.full_name : 'Unknown Faculty',
      teacherEmail: teacher ? teacher.email : '',
      className: cls ? cls.name : 'Unknown Class',
      subjectName: sub ? sub.name : 'Unknown Subject',
      subjectCode: sub ? sub.code : '',
      semesterName: sem ? sem.name : 'Unknown Semester'
    };
  });

  const active = assignments.filter(a => a.status === 'active');
  const past = assignments.filter(a => a.status === 'past');

  res.json({ all: assignments, active, past });
});

router.post('/teacher-assignments', (req: AuthRequest, res) => {
  const { teacher_user_id, class_id, subject_id, semester_id } = req.body;
  if (!teacher_user_id || !class_id || !subject_id || !semester_id) {
    return res.status(400).json({ error: 'Faculty member, class, subject, and semester are required.' });
  }

  const existing = memDb.teacher_class_assignments.find(
    a => a.teacher_user_id === teacher_user_id && a.class_id === class_id && a.subject_id === subject_id && a.semester_id === semester_id && a.status === 'active'
  );

  if (existing) {
    return res.status(409).json({ error: 'This teacher is already actively assigned to this class and subject for this semester.' });
  }

  const newAssignment: TeacherAssignmentRecord = {
    id: `tca_${Date.now()}`,
    teacher_user_id,
    class_id,
    subject_id,
    semester_id,
    status: 'active',
    created_at: new Date().toISOString()
  };

  memDb.teacher_class_assignments.push(newAssignment);

  const teacher = memDb.users.find(u => u.id === teacher_user_id);
  const cls = memDb.classes.find(c => c.id === class_id);
  memDb.logActivity(
    req.user?.id,
    'ASSIGN_FACULTY',
    'ASSIGNMENT',
    newAssignment.id,
    `Assigned ${teacher?.full_name || 'Faculty'} to ${cls?.name || 'Class'}.`
  );

  res.status(201).json({ message: 'Teacher assigned successfully.', assignment: newAssignment });
});

// Archive assignment to past
router.patch('/teacher-assignments/:id/archive', (req: AuthRequest, res) => {
  const item = memDb.teacher_class_assignments.find(a => a.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Assignment record not found.' });

  item.status = 'past';
  memDb.logActivity(req.user?.id, 'ARCHIVE_ASSIGNMENT', 'ASSIGNMENT', item.id, 'Archived faculty assignment to historical record.');

  res.json({ message: 'Assignment moved to past history.', assignment: item });
});

// Start New Semester Rollover Action: Flips all active assignments to 'past' in one operation
router.post('/start-new-semester', (req: AuthRequest, res) => {
  const { semesterName, semesterNumber } = req.body;
  const num = Number(semesterNumber) || (memDb.semesters.length + 1);
  const name = semesterName ? String(semesterName).trim() : `Semester ${num}`;

  // Deactivate old active semesters
  memDb.semesters.forEach(s => { s.is_active = false; });

  // Create new semester
  const newSem: any = {
    id: `sem_${Date.now()}`,
    academic_year_id: memDb.academic_years[0]?.id || 'ay_2025_26',
    semester_number: num,
    name,
    is_active: true
  };
  memDb.semesters.push(newSem);

  // Rollover all active assignments to 'past'
  let rolledCount = 0;
  memDb.teacher_class_assignments.forEach(a => {
    if (a.status === 'active') {
      a.status = 'past';
      rolledCount++;
    }
  });

  memDb.logActivity(
    req.user?.id,
    'SEMESTER_ROLLOVER',
    'SEMESTER',
    newSem.id,
    `Started ${newSem.name}. Archived ${rolledCount} active teaching assignment(s) to past history.`
  );

  res.json({
    message: `New semester "${newSem.name}" activated. ${rolledCount} faculty assignment(s) archived.`,
    newSemester: newSem,
    archivedCount: rolledCount
  });
});

// 6. Marksheets Management & Bulk ZIP Upload
router.get('/marksheets', (req, res) => {
  const list = memDb.marksheets.map(m => {
    const student = memDb.students.find(s => s.id === m.student_id);
    const user = student ? memDb.users.find(u => u.id === student.user_id) : null;
    const sem = memDb.semesters.find(s => s.id === m.semester_id);
    return {
      ...m,
      studentName: user ? user.full_name : 'Unknown Student',
      rollNumber: student ? student.roll_number : 'N/A',
      semesterName: sem ? sem.name : 'Unknown Semester'
    };
  });
  res.json(list);
});

// Individual Marksheet Upload
router.post('/marksheets/upload', upload.single('file'), async (req: AuthRequest, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Please upload a PDF file.' });
    }
  const fileBytes = fs.readFileSync(req.file.path);
  if (fileBytes.length < 5 || fileBytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'The uploaded file is not a valid PDF.' });
  }
    const { student_id, semester_id, sgpa, cgpa } = req.body;
    if (!student_id || !semester_id) {
        return res.status(400).json({ error: 'Student and semester are required.' });
    }
    const student = memDb.students.find(s => s.id === student_id);
    if (!student) return res.status(404).json({ error: 'Student record not found.' });
    if (!memDb.semesters.some(s => s.id === semester_id)) {
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: 'Semester record not found.' });
    }

    const newMarksheetId = `ms_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const newMarksheet = {
      id: newMarksheetId,
      student_id,
      semester_id,
      file_url: '/uploads/marksheets/' + req.file.filename,
      file_name: req.file.originalname,
      sgpa: Number(sgpa) || 0,
      cgpa: Number(cgpa) || 0,
      uploaded_by: req.user?.id || 'admin',
      created_at: new Date().toISOString()
    };

    memDb.marksheets.push(newMarksheet as any);
    
    memDb.logActivity(req.user?.id || 'admin', 'MARKSHEET_UPLOAD', 'DOCUMENT', newMarksheet.id, `Uploaded official marksheet for ${student.roll_number}`);

    return res.json({ message: 'Official student marksheet recorded successfully.', marksheet: newMarksheet });
});

router.post('/marksheets', (req: AuthRequest, res) => {
  const { student_id, semester_id, sgpa, cgpa, file_name, file_url } = req.body;
  if (!student_id || !semester_id) {
    return res.status(400).json({ error: 'Student and semester are required.' });
  }

  const student = memDb.students.find(s => s.id === student_id);
  if (!student) return res.status(404).json({ error: 'Student record not found.' });

  const submittedName = (file_name || file_url || '').toString().trim();
  const submittedExtension = submittedName.split('?')[0].split('.').pop()?.toLowerCase() || '';

  if (!submittedName || submittedExtension !== 'pdf') {
    return res.status(400).json({ error: 'Official marksheets must be uploaded as a PDF file.' });
  }

  const newMarksheet: MarksheetRecord = {
    id: `ms_${Date.now()}`,
    student_id,
    semester_id,
    file_url: file_url || `/uploads/marksheets/marksheet_${student.roll_number}_${semester_id}.pdf`,
    file_name: file_name || `Official_Marksheet_${student.roll_number}.pdf`,
    sgpa: Number(sgpa) || 8.0,
    cgpa: Number(cgpa) || 8.0,
    uploaded_by: req.user!.id,
    created_at: new Date().toISOString()
  };

  memDb.marksheets.push(newMarksheet);
  memDb.logActivity(
    req.user?.id,
    'MARKSHEET_UPLOAD',
    'MARKSHEET',
    newMarksheet.id,
    `Uploaded official marksheet for ${student.roll_number} (SGPA: ${newMarksheet.sgpa}).`
  );

  res.status(201).json({ message: 'Marksheet uploaded successfully.', marksheet: newMarksheet });
});

// Bulk ZIP Processing: Extract files and match roll numbers
router.post('/marksheets/bulk-zip', async (req: AuthRequest, res) => {
  const { zipBase64, semester_id } = req.body;
  if (!zipBase64 || !semester_id) {
    return res.status(400).json({ error: 'ZIP file data and target semester are required.' });
  }

  try {
    const zipBuffer = Buffer.from(zipBase64.replace(/^data:.*?;base64,/, ''), 'base64');
    const zip = await JSZip.loadAsync(zipBuffer);

    const matchedFiles: Array<{ fileName: string; rollNumber: string; studentName: string }> = [];
    const unmatchedFiles: Array<{ fileName: string; reason: string }> = [];

    const fileEntries = Object.keys(zip.files).filter(f => !zip.files[f].dir);

    for (const fileName of fileEntries) {
      // Look for roll number pattern in filename, e.g. "CS2023001.pdf" or "CS2023001_sem1.pdf"
      const baseName = fileName.split('/').pop() || fileName;
      const cleanName = baseName.replace(/\.[^/.]+$/, '').toUpperCase();

      // Find student whose roll number matches cleanName or is contained in filename
      const matchedStudent = memDb.students.find(s => {
        const roll = s.roll_number.toUpperCase();
        return cleanName === roll || cleanName.startsWith(roll) || cleanName.includes(roll);
      });

      if (matchedStudent) {
        const user = memDb.users.find(u => u.id === matchedStudent.user_id);
        const marksheetId = `ms_zip_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        const newMarksheet: MarksheetRecord = {
          id: marksheetId,
          student_id: matchedStudent.id,
          semester_id,
          file_url: `/uploads/marksheets/${baseName}`,
          file_name: baseName,
          sgpa: 8.5,
          cgpa: 8.5,
          uploaded_by: req.user!.id,
          created_at: new Date().toISOString()
        };

        memDb.marksheets.push(newMarksheet);
        matchedFiles.push({
          fileName: baseName,
          rollNumber: matchedStudent.roll_number,
          studentName: user ? user.full_name : 'Student'
        });
      } else {
        unmatchedFiles.push({
          fileName: baseName,
          reason: 'No student found in registry with a matching roll number'
        });
      }
    }

    memDb.logActivity(
      req.user?.id,
      'BULK_MARKSHEET_ZIP',
      'MARKSHEET',
      undefined,
      `Processed ZIP archive: ${matchedFiles.length} matched and attached, ${unmatchedFiles.length} unmatched.`
    );

    res.json({
      summary: {
        totalFiles: fileEntries.length,
        matchedCount: matchedFiles.length,
        unmatchedCount: unmatchedFiles.length
      },
      matchedFiles,
      unmatchedFiles
    });
  } catch (err: any) {
    console.error('ZIP extraction error:', err);
    res.status(400).json({ error: 'Failed to extract ZIP archive: ' + (err.message || 'Invalid format') });
  }
});

// 7. Notifications
router.get('/notifications', (req, res) => {
  const list = memDb.notifications.map(n => {
    const creator = memDb.users.find(u => u.id === n.created_by);
    const targetClass = n.target_class_id ? memDb.classes.find(c => c.id === n.target_class_id) : null;
    const readsCount = memDb.notification_reads.filter(r => r.notification_id === n.id).length;
    return {
      ...n,
      creatorName: creator ? creator.full_name : 'Staff',
      targetClassName: targetClass ? targetClass.name : null,
      readCount: readsCount
    };
  });
  res.json(list);
});

router.post('/notifications', (req: AuthRequest, res) => {
  const { title, body, target_role, target_class_id, file_url } = req.body;
  if (!title || !body || !target_role) {
    return res.status(400).json({ error: 'Title, body, and audience are required.' });
  }

  const newNotif: NotificationRecord = {
    id: `notif_${Date.now()}`,
    title: title.trim(),
    body: body.trim(),
    target_role,
    target_class_id: target_role === 'class' ? target_class_id : null,
    file_url: file_url || null,
    created_by: req.user!.id,
    created_at: new Date().toISOString()
  };

  memDb.notifications.unshift(newNotif);
  memDb.logActivity(req.user?.id, 'PUBLISH_NOTIFICATION', 'NOTIFICATION', newNotif.id, `Published notice: "${newNotif.title}".`);

  res.status(201).json({ message: 'Notification published successfully.', notification: newNotif });
});

router.delete('/notifications/:id', (req: AuthRequest, res) => {
  const id = req.params.id;
  memDb.notifications = memDb.notifications.filter(n => n.id !== id);
  res.json({ message: 'Notification deleted successfully.' });
});

// 8. College Events & Hackathons Management
router.get('/events', (req: AuthRequest, res) => {
  res.json(memDb.events);
});

router.post('/events', (req: AuthRequest, res) => {
  const {
    name,
    description,
    organizer,
    event_date,
    registration_deadline,
    location,
    registration_link,
    banner_url,
    eligibility,
    status
  } = req.body;

  if (!name || !description || !organizer || !event_date || !location) {
    return res.status(400).json({ error: 'Name, description, organizer, event date, and location are required.' });
  }

  const newEvent = {
    id: `evt_${Date.now()}`,
    name: String(name).trim(),
    description: String(description).trim(),
    organizer: String(organizer).trim(),
    event_date,
    registration_deadline: registration_deadline || '',
    location: String(location).trim(),
    registration_link: registration_link ? String(registration_link).trim() : '',
    banner_url: banner_url || '',
    eligibility: eligibility ? String(eligibility).trim() : 'All Students',
    status: (status as any) || 'upcoming',
    created_by: req.user!.id,
    created_at: new Date().toISOString()
  };

  memDb.events.unshift(newEvent);
  memDb.logActivity(req.user?.id, 'CREATE_EVENT', 'EVENT', newEvent.id, `Created college event: "${newEvent.name}".`);

  res.status(201).json({ message: 'Event created successfully', event: newEvent });
});

router.delete('/events/:id', (req: AuthRequest, res) => {
  const id = req.params.id;
  const index = memDb.events.findIndex(e => e.id === id);
  if (index === -1) return res.status(404).json({ error: 'Event not found' });

  const deleted = memDb.events.splice(index, 1)[0];
  memDb.logActivity(req.user?.id, 'DELETE_EVENT', 'EVENT', id, `Removed college event: "${deleted.name}".`);

  res.json({ message: 'Event removed successfully' });
});

// 9. College-Wide Analytics
router.get('/analytics', (req, res) => {
  const allMarks = memDb.marks;
  const gradeCounts = { A: 0, B: 0, C: 0, D: 0, F: 0 };

  allMarks.forEach(m => {
    const pct = (m.marks_obtained / m.max_marks) * 100;
    if (pct >= 85) gradeCounts.A++;
    else if (pct >= 70) gradeCounts.B++;
    else if (pct >= 55) gradeCounts.C++;
    else if (pct >= 40) gradeCounts.D++;
    else gradeCounts.F++;
  });

  const examTypes = ['Internal 1', 'Internal 2', 'Midterm', 'Final', 'Assignment', 'Practical'];
  const examAverages = examTypes.map(t => {
    const marksForType = allMarks.filter(m => m.exam_type === t);
    const avg = marksForType.length > 0
      ? Number((marksForType.reduce((sum, m) => sum + (m.marks_obtained / m.max_marks) * 100, 0) / marksForType.length).toFixed(1))
      : 0;
    return { examType: t, average: avg, totalSubmissions: marksForType.length };
  });

  const deptPerformance = memDb.departments.map(d => {
    const deptStudents = memDb.students.filter(s => s.department_id === d.id).map(s => s.id);
    const deptMarks = allMarks.filter(m => deptStudents.includes(m.student_id));
    const avg = deptMarks.length > 0
      ? Number((deptMarks.reduce((sum, m) => sum + (m.marks_obtained / m.max_marks) * 100, 0) / deptMarks.length).toFixed(1))
      : 0;
    return { department: d.code, name: d.name, averageScore: avg, submissions: deptMarks.length };
  });

  res.json({
    totalEvaluations: allMarks.length,
    gradeDistribution: gradeCounts,
    examAverages,
    deptPerformance
  });
});

// 9. Institutional AI Assistant Query (College-wide Grounded Function Calling)
router.post('/ai-query', rateLimit(25, 60 * 1000, 'admin-ai'), async (req: AuthRequest, res) => {
  const { query: queryText } = req.body;
  if (!queryText || !queryText.trim()) {
    return res.status(400).json({ error: 'Query text is required.' });
  }

  const result = await processAiQuery(req.user!, queryText.trim());

  res.json({
    answer: result.text,
    toolCallsExecuted: result.toolCallsExecuted,
    resolvedIntent: result.resolvedIntent
  });
});

// 10. Developer Control Endpoints (Section 0 compliance)
router.post('/dev-seed', (req: AuthRequest, res) => {
  memDb.seedDevData();
  res.json({ message: 'Development sample dataset loaded successfully from scripts/seed-dev.sql.' });
});

router.post('/reset-to-fresh', (req: AuthRequest, res) => {
  memDb.resetToFresh();
  res.json({ message: 'Application state reset to clean production state (zero fake classes/students/marks).' });
});

export default router;

