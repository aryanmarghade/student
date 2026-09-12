import { Router } from 'express';
import { memDb, MarkRecord, NotificationRecord } from '../db.js';
import { requireAuth, requireRole, AuthRequest, verifyTeacherClassScope, rateLimit } from '../auth.js';
import { processAiQuery } from '../ai-assistant.js';

const router = Router();

// Middleware: all teacher routes require role 'teacher'
router.use(requireAuth, requireRole('teacher'));

// 1. Get Teacher Assignments (Current active and past/historical separated)
router.get('/assignments', (req: AuthRequest, res) => {
  const teacherId = req.user!.id;
  const assignments = memDb.teacher_class_assignments
    .filter(a => a.teacher_user_id === teacherId)
    .map(a => {
      const cls = memDb.classes.find(c => c.id === a.class_id);
      const sub = memDb.subjects.find(s => s.id === a.subject_id);
      const sem = memDb.semesters.find(s => s.id === a.semester_id);
      const studentCount = cls ? memDb.students.filter(s => s.class_id === cls.id).length : 0;
      return {
        ...a,
        className: cls ? cls.name : 'Unknown Class',
        classYear: cls ? cls.year : 0,
        classSection: cls ? cls.section : '',
        subjectName: sub ? sub.name : 'Unknown Subject',
        subjectCode: sub ? sub.code : '',
        maxMarks: sub ? sub.max_marks : 100,
        semesterName: sem ? sem.name : 'Unknown Semester',
        studentCount
      };
    });

  const active = assignments.filter(a => a.status === 'active');
  const past = assignments.filter(a => a.status === 'past');

  res.json({ active, past });
});

// 2. Class Roster: Full list of students in assigned class
// SERVER-SIDE SCOPE CHECK: Enforce teacher is assigned to this class!
router.get('/classes/:classId/students', (req: AuthRequest, res) => {
  const { classId } = req.params;
  const teacherId = req.user!.id;

  if (!verifyTeacherClassScope(classId, undefined, undefined, teacherId)) {
    return res.status(403).json({
      error: 'Access Denied: You are not assigned to instruct or view records for this class.'
    });
  }

  const students = memDb.students
    .filter(s => s.class_id === classId)
    .map(s => {
      const user = memDb.users.find(u => u.id === s.user_id);
      return {
        id: s.id,
        user_id: s.user_id,
        roll_number: s.roll_number,
        full_name: user ? user.full_name : 'Unknown',
        email: user ? user.email : '',
        linkedin_url: s.linkedin_url,
        github_url: s.github_url,
        profile_strength: s.profile_strength
      };
    });

  const targetClass = memDb.classes.find(c => c.id === classId);

  res.json({
    class: targetClass,
    students
  });
});

// 3. Marks Grid: Retrieve spreadsheet marks for assigned Class + Subject + Semester
router.get('/classes/:classId/subjects/:subjectId/marks', (req: AuthRequest, res) => {
  const { classId, subjectId } = req.params;
  const { semester_id } = req.query;
  const teacherId = req.user!.id;

  if (!verifyTeacherClassScope(classId, subjectId, undefined, teacherId)) {
    return res.status(403).json({
      error: 'Access Denied: You are not assigned to this class and subject.'
    });
  }

  const students = memDb.students
    .filter(s => s.class_id === classId)
    .map(s => {
      const user = memDb.users.find(u => u.id === s.user_id);
      return {
        id: s.id,
        roll_number: s.roll_number,
        full_name: user ? user.full_name : 'Student'
      };
    });

  let marks = memDb.marks.filter(m => m.subject_id === subjectId);
  if (semester_id) {
    marks = marks.filter(m => m.semester_id === semester_id);
  }

  // Define standard exam types and their maximum marks
  const examColumns = [
    { type: 'Internal 1', max: 25 },
    { type: 'Internal 2', max: 25 },
    { type: 'Midterm', max: 50 },
    { type: 'Final', max: 100 },
    { type: 'Assignment', max: 20 },
    { type: 'Practical', max: 30 }
  ];

  // Build grid data: studentId -> { examType -> { marks_obtained, max_marks, mark_id } }
  const grid: Record<string, Record<string, any>> = {};
  for (const s of students) {
    grid[s.id] = {};
    for (const ec of examColumns) {
      const m = marks.find(x => x.student_id === s.id && x.exam_type === ec.type);
      grid[s.id][ec.type] = {
        marks_obtained: m ? m.marks_obtained : null,
        max_marks: ec.max,
        id: m ? m.id : null
      };
    }
  }

  res.json({
    students,
    examColumns,
    grid
  });
});

// Save / Batch Update Marks in Grid
router.post('/classes/:classId/subjects/:subjectId/marks', (req: AuthRequest, res) => {
  const { classId, subjectId } = req.params;
  const { semester_id, updates } = req.body;
  const teacherId = req.user!.id;

  if (!verifyTeacherClassScope(classId, subjectId, undefined, teacherId)) {
    return res.status(403).json({
      error: 'Access Denied: You are not authorized to update marks for this class/subject.'
    });
  }

  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ error: 'Updates array is required.' });
  }

  const validationErrors: string[] = [];
  const processed: any[] = [];

  for (const item of updates) {
    const { student_id, exam_type, marks_obtained, max_marks } = item;

    if (marks_obtained === null || marks_obtained === undefined || marks_obtained === '') continue;

    const numMarks = Number(marks_obtained);
    const numMax = Number(max_marks) || 100;

    // Strict validation: marks cannot exceed maximum or be negative
    if (isNaN(numMarks) || numMarks < 0) {
      validationErrors.push(`Student ${student_id}: Marks cannot be negative.`);
      continue;
    }
    if (numMarks > numMax) {
      validationErrors.push(`Student ${student_id} (${exam_type}): Marks (${numMarks}) cannot exceed maximum allowed (${numMax}).`);
      continue;
    }

    // Find existing mark record or insert new
    let existing = memDb.marks.find(
      m => m.student_id === student_id && m.subject_id === subjectId && m.exam_type === exam_type && (semester_id ? m.semester_id === semester_id : true)
    );

    if (existing) {
      existing.marks_obtained = numMarks;
      existing.max_marks = numMax;
      existing.teacher_user_id = teacherId;
      processed.push(existing);
    } else {
      const newMark: MarkRecord = {
        id: `mrk_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        student_id,
        subject_id: subjectId,
        semester_id: semester_id || (memDb.semesters.find(s => s.is_active)?.id || memDb.semesters[0]?.id || 'sem_1'),
        teacher_user_id: teacherId,
        exam_type,
        marks_obtained: numMarks,
        max_marks: numMax,
        created_at: new Date().toISOString()
      };
      memDb.marks.push(newMark);
      processed.push(newMark);
    }
  }

  if (processed.length > 0) {
    const cls = memDb.classes.find(c => c.id === classId);
    const sub = memDb.subjects.find(s => s.id === subjectId);
    memDb.logActivity(
      teacherId,
      'MARKS_SAVED',
      'MARKS',
      undefined,
      `Saved ${processed.length} mark record(s) for ${cls?.name || 'Class'} in ${sub?.name || 'Subject'}.`
    );
  }

  if (validationErrors.length > 0 && processed.length === 0) {
    return res.status(400).json({
      error: 'Validation failed on submitted marks',
      details: validationErrors
    });
  }

  res.json({
    message: `Successfully saved ${processed.length} mark entries.`,
    savedCount: processed.length,
    validationWarnings: validationErrors
  });
});

// Notifications inbox for teacher
router.get('/notifications', (req: AuthRequest, res) => {
  const teacherId = req.user!.id;
  const teacherClasses = memDb.teacher_class_assignments
    .filter(a => a.teacher_user_id === teacherId)
    .map(a => a.class_id);

  const list = memDb.notifications
    .filter(n =>
      n.target_role === 'all' ||
      n.target_role === 'all_teachers' ||
      (n.target_role === 'class' && n.target_class_id && teacherClasses.includes(n.target_class_id))
    )
    .map(n => {
      const creator = memDb.users.find(u => u.id === n.created_by);
      const isRead = memDb.notification_reads.some(r => r.notification_id === n.id && r.user_id === teacherId);
      const targetClass = n.target_class_id ? memDb.classes.find(c => c.id === n.target_class_id) : null;
      return {
        ...n,
        creatorName: creator ? creator.full_name : 'Staff',
        targetClassName: targetClass ? targetClass.name : null,
        is_read: isRead
      };
    });

  res.json(list);
});

// Mark notification as read
router.post('/notifications/:id/read', (req: AuthRequest, res) => {
  const teacherId = req.user!.id;
  const notifId = req.params.id;

  const exists = memDb.notification_reads.find(r => r.notification_id === notifId && r.user_id === teacherId);
  if (!exists) {
    memDb.notification_reads.push({
      id: `nr_${Date.now()}`,
      notification_id: notifId,
      user_id: teacherId,
      read_at: new Date().toISOString()
    });
  }

  res.json({ message: 'Marked as read' });
});

// Post class announcement
router.post('/announcements', (req: AuthRequest, res) => {
  const teacherId = req.user!.id;
  const { title, body, class_id } = req.body;

  if (!title || !body || !class_id) {
    return res.status(400).json({ error: 'Title, message body, and assigned class are required.' });
  }

  if (!verifyTeacherClassScope(class_id, undefined, undefined, teacherId)) {
    return res.status(403).json({ error: 'You can only publish announcements to your assigned classes.' });
  }

  const newNotif: NotificationRecord = {
    id: `notif_${Date.now()}`,
    title: title.trim(),
    body: body.trim(),
    target_role: 'class',
    target_class_id: class_id,
    file_url: null,
    created_by: teacherId,
    created_at: new Date().toISOString()
  };

  memDb.notifications.unshift(newNotif);
  const cls = memDb.classes.find(c => c.id === class_id);
  memDb.logActivity(teacherId, 'CLASS_ANNOUNCEMENT', 'NOTIFICATION', newNotif.id, `Posted announcement to ${cls?.name || 'Class'}.`);

  res.status(201).json({ message: 'Announcement posted to class successfully.', notification: newNotif });
});

// 4. Analytics Engine: Scoped strictly to Teacher's Assigned Classes
// Supports: Scope (Whole Class / Selected Students / Single Student)
// Filters: Semesters checklist, Exam Types checklist
// Returns: Statistics (mean, median, stddev, min, max, count), Linear Regression Trend Line, Charts data
router.post('/analytics', (req: AuthRequest, res) => {
  const teacherId = req.user!.id;
  const {
    classId,
    scope = 'whole_class', // 'whole_class' | 'selected_students' | 'single_student'
    studentIds = [],
    selectedSemesters = ['sem_3', 'sem_4'],
    selectedExamTypes = ['Internal 1', 'Internal 2', 'Midterm', 'Final', 'Assignment', 'Practical'],
    subjectId
  } = req.body;

  if (!classId) {
    return res.status(400).json({ error: 'Class ID is required.' });
  }

  // Server-side check
  if (!verifyTeacherClassScope(classId, undefined, undefined, teacherId)) {
    return res.status(403).json({ error: 'Access Denied: Class outside your assigned teaching scope.' });
  }

  // Determine target student pool
  let targetStudents = memDb.students.filter(s => s.class_id === classId);
  if (scope === 'selected_students' && studentIds.length > 0) {
    targetStudents = targetStudents.filter(s => studentIds.includes(s.id));
  } else if (scope === 'single_student' && studentIds.length > 0) {
    targetStudents = targetStudents.filter(s => s.id === studentIds[0]);
  }

  const targetStudentIds = targetStudents.map(s => s.id);

  // Filter marks
  let filteredMarks = memDb.marks.filter(m => {
    if (!targetStudentIds.includes(m.student_id)) return false;
    if (subjectId && m.subject_id !== subjectId) return false;
    if (selectedSemesters.length > 0 && !selectedSemesters.includes(m.semester_id)) return false;
    if (selectedExamTypes.length > 0 && !selectedExamTypes.includes(m.exam_type)) return false;
    return true;
  });

  // Calculate percentage values for all filtered marks
  const percentageScores = filteredMarks.map(m => (m.marks_obtained / m.max_marks) * 100);

  // Computed Statistics: Mean, Median, Standard Deviation, Min, Max, Count
  const count = percentageScores.length;
  let mean = 0;
  let median = 0;
  let stdDev = 0;
  let min = 0;
  let max = 0;

  if (count > 0) {
    const sum = percentageScores.reduce((a, b) => a + b, 0);
    mean = Number((sum / count).toFixed(2));

    const sorted = [...percentageScores].sort((a, b) => a - b);
    min = Number(sorted[0].toFixed(2));
    max = Number(sorted[count - 1].toFixed(2));

    const mid = Math.floor(count / 2);
    median = Number((count % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));

    const variance = percentageScores.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / count;
    stdDev = Number(Math.sqrt(variance).toFixed(2));
  }

  // Linear Regression Trend Across Included Semesters
  // Sort marks chronologically
  filteredMarks.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const regressionPoints = filteredMarks.map((m, i) => ({
    x: i + 1,
    y: Number(((m.marks_obtained / m.max_marks) * 100).toFixed(2)),
    label: `${m.exam_type} (${m.semester_id})`
  }));

  let slope = 0;
  let intercept = 0;
  let predictedNextScore = mean;

  if (regressionPoints.length >= 2) {
    const n = regressionPoints.length;
    const sumX = regressionPoints.reduce((sum, p) => sum + p.x, 0);
    const sumY = regressionPoints.reduce((sum, p) => sum + p.y, 0);
    const sumXY = regressionPoints.reduce((sum, p) => sum + p.x * p.y, 0);
    const sumX2 = regressionPoints.reduce((sum, p) => sum + p.x * p.x, 0);

    const denom = (n * sumX2 - sumX * sumX);
    if (denom !== 0) {
      slope = (n * sumXY - sumX * sumY) / denom;
      intercept = (sumY - slope * sumX) / n;
      const nextX = n + 1;
      predictedNextScore = Number(Math.min(100, Math.max(0, slope * nextX + intercept)).toFixed(2));
    }
  }

  const regressionTrendLine = regressionPoints.map(p => ({
    x: p.x,
    actual: p.y,
    trend: Number((slope * p.x + intercept).toFixed(2)),
    label: p.label
  }));

  // Grade Distribution (A: 85+, B: 70-84, C: 55-69, D: 40-54, F: <40)
  const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  percentageScores.forEach(score => {
    if (score >= 85) gradeDistribution.A++;
    else if (score >= 70) gradeDistribution.B++;
    else if (score >= 55) gradeDistribution.C++;
    else if (score >= 40) gradeDistribution.D++;
    else gradeDistribution.F++;
  });

  // Average by Exam Type (for Bar Chart)
  const averageByExamType = selectedExamTypes.map(t => {
    const scores = filteredMarks.filter(m => m.exam_type === t).map(m => (m.marks_obtained / m.max_marks) * 100);
    const avg = scores.length > 0 ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : 0;
    return { examType: t, average: avg, count: scores.length };
  });

  // Average by Student (for Bar Chart)
  const averageByStudent = targetStudents.map(s => {
    const user = memDb.users.find(u => u.id === s.user_id);
    const sMarks = filteredMarks.filter(m => m.student_id === s.id).map(m => (m.marks_obtained / m.max_marks) * 100);
    const avg = sMarks.length > 0 ? Number((sMarks.reduce((a, b) => a + b, 0) / sMarks.length).toFixed(2)) : 0;
    return {
      studentId: s.id,
      rollNumber: s.roll_number,
      name: user ? user.full_name : s.roll_number,
      average: avg
    };
  });

  res.json({
    scope,
    totalStudentsIncluded: targetStudents.length,
    statistics: {
      count,
      mean,
      median,
      stdDev,
      min,
      max
    },
    linearRegression: {
      slope: Number(slope.toFixed(3)),
      intercept: Number(intercept.toFixed(2)),
      predictedNextScore,
      points: regressionTrendLine,
      label: 'Linear Trend Projection (Estimated)'
    },
    charts: {
      gradeDistribution,
      averageByExamType,
      averageByStudent
    },
    rawExportData: filteredMarks.map(m => {
      const s = targetStudents.find(x => x.id === m.student_id);
      const u = s ? memDb.users.find(usr => usr.id === s.user_id) : null;
      return {
        StudentName: u ? u.full_name : '',
        RollNumber: s ? s.roll_number : '',
        ExamType: m.exam_type,
        Semester: m.semester_id,
        MarksObtained: m.marks_obtained,
        MaxMarks: m.max_marks,
        Percentage: ((m.marks_obtained / m.max_marks) * 100).toFixed(1)
      };
    })
  });
});

// 5. Detailed Student Profile & Portfolio Lookup for Faculty
router.get('/students/:studentId/full-profile', (req: AuthRequest, res) => {
  const teacherId = req.user!.id;
  const { studentId } = req.params;

  const student = memDb.students.find(s => s.id === studentId);
  if (!student) return res.status(404).json({ error: 'Student record not found.' });

  // Security check: Teacher can only inspect students in their assigned classes
  if (!verifyTeacherClassScope(student.class_id, undefined, undefined, teacherId)) {
    return res.status(403).json({ error: 'Access Denied: This student is not enrolled in your assigned classes.' });
  }

  const user = memDb.users.find(u => u.id === student.user_id);
  const cls = memDb.classes.find(c => c.id === student.class_id);
  const dept = memDb.departments.find(d => d.id === student.department_id);

  const projects = memDb.projects.filter(p => p.student_id === student.id);
  const achievements = memDb.achievements.filter(a => a.student_id === student.id);
  const certifications = memDb.certifications.filter(c => c.student_id === student.id);
  const hackathons = memDb.hackathons.filter(h => h.student_id === student.id);
  const documents = memDb.student_documents.filter(d => d.student_id === student.id);
  const studentMarks = memDb.marks.filter(m => m.student_id === student.id);
  const marksheets: any[] = []; // Teachers cannot access marksheets

  res.json({
    id: student.id,
    roll_number: student.roll_number,
    full_name: user ? user.full_name : 'Unknown',
    email: user ? user.email : '',
    className: cls ? cls.name : '',
    departmentName: dept ? dept.name : '',
    bio: student.bio || '',
    linkedin_url: student.linkedin_url || '',
    github_url: student.github_url || '',
    profile_photo_url: student.profile_photo_url || '',
    profile_strength: student.profile_strength || 50,
    projects,
    achievements,
    certifications,
    hackathons,
    documents,
    marks: studentMarks,
    marksheets
  });
});

// 6. Excel / CSV Batch Mark Import
router.post('/classes/:classId/subjects/:subjectId/import-marks', (req: AuthRequest, res) => {
  const teacherId = req.user!.id;
  const { classId, subjectId } = req.params;
  const { entries, semester_id } = req.body;

  if (!verifyTeacherClassScope(classId, subjectId, undefined, teacherId)) {
    return res.status(403).json({ error: 'Access Denied: You are not assigned to this class and subject.' });
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: 'No marks data provided for import.' });
  }

  const targetSemester = semester_id || 'sem_1';
  const classStudents = memDb.students.filter(s => s.class_id === classId);
  const errors: Array<{ row: number; reason: string }> = [];
  const processed: MarkRecord[] = [];

  entries.forEach((item: any, idx: number) => {
    const roll = String(item.roll_number || '').trim().toUpperCase();
    const examType = String(item.exam_type || 'Internal 1').trim();
    const marksObtained = Number(item.marks_obtained);
    const maxMarks = Number(item.max_marks || 25);

    if (!roll) {
      errors.push({ row: idx + 1, reason: 'Missing roll number' });
      return;
    }

    const student = classStudents.find(s => s.roll_number.toUpperCase() === roll);
    if (!student) {
      errors.push({ row: idx + 1, reason: `Student with roll number "${roll}" not found in this class.` });
      return;
    }

    if (isNaN(marksObtained) || marksObtained < 0) {
      errors.push({ row: idx + 1, reason: `Invalid marks score for ${roll}: must be a non-negative number.` });
      return;
    }

    if (marksObtained > maxMarks) {
      errors.push({ row: idx + 1, reason: `Marks obtained (${marksObtained}) exceeds max marks (${maxMarks}) for ${roll}.` });
      return;
    }

    // Upsert mark record
    const existingIdx = memDb.marks.findIndex(
      m => m.student_id === student.id && m.subject_id === subjectId && m.semester_id === targetSemester && m.exam_type === examType
    );

    const record: MarkRecord = {
      id: existingIdx !== -1 ? memDb.marks[existingIdx].id : `mrk_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      student_id: student.id,
      subject_id: subjectId,
      semester_id: targetSemester,
      teacher_user_id: teacherId,
      exam_type: examType as any,
      marks_obtained: marksObtained,
      max_marks: maxMarks,
      created_at: new Date().toISOString()
    };

    if (existingIdx !== -1) {
      memDb.marks[existingIdx] = record;
    } else {
      memDb.marks.push(record);
    }
    processed.push(record);
  });

  memDb.logActivity(
    teacherId,
    'IMPORT_MARKS',
    'MARKS',
    undefined,
    `Batch imported ${processed.length} marks entries via file import (${errors.length} skipped).`
  );

  res.json({
    message: `Batch import completed. Successfully recorded ${processed.length} marks entries.`,
    importedCount: processed.length,
    errors
  });
});

// 7. College Events & Hackathons
router.get('/events', (req: AuthRequest, res) => {
  res.json(memDb.events);
});

// 8. AI Assistant Query for Teachers (Grounded Function Calling, Rate Limited)
router.post('/ai-query', rateLimit(25, 60 * 1000, 'teacher-ai'), async (req: AuthRequest, res) => {
  const { query: queryText } = req.body;
  if (!queryText || !queryText.trim()) {
    return res.status(400).json({ error: 'Query text is required.' });
  }

  const result = await processAiQuery(req.user!, queryText.trim());

  // Log to database audit table: ai_query_logs
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

