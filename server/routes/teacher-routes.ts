import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { query, logActivity, id } from '../db.js';
import { requireAuth, requireRole, verifyTeacherClassScope, AuthRequest, rateLimit } from '../auth.js';
import { processAiQuery } from '../ai-assistant.js';
import { linearRegression, median, standardDeviation } from '../analytics.js';
import { currentMonth } from '../github-sync.js';
import { calculateAcademicHistory } from '../academic-service.js';
import { processTeacherAiProgress } from '../teacher-ai-progress.js';
import { getStudentComprehensiveEvidence } from '../student-evidence-service.js';
import {
  createAssessmentWithRubric,
  updateAssessmentRubricAndKey,
  getAssessmentWithRubric,
  getSubmissionsForAssessment,
  evaluateSubmissionWithAi,
  saveOrUpdateMarks,
  previewCsvMarksImport,
  calculateClassSubjectAnalytics,
} from '../teacher-marking-service.js';
import { handleTeacherAiRequest } from '../role-intelligence-engine.js';

const router = Router();
router.use(requireAuth, requireRole('teacher'));

export async function getTeacherVisibility(teacherUserId: string) {
  const res = await query<any>(
    'SELECT * FROM teacher_analytics_visibility WHERE teacher_user_id = $1',
    [teacherUserId]
  );
  if (res.rows.length > 0) {
    const r = res.rows[0];
    return {
      teacher_user_id: teacherUserId,
      academic_enabled: r.academic_enabled !== false,
      github_enabled: r.github_enabled !== false,
      hackerrank_enabled: r.hackerrank_enabled !== false,
      linkedin_enabled: r.linkedin_enabled !== false,
      leetcode_enabled: r.leetcode_enabled !== false,
      hackathon_enabled: r.hackathon_enabled !== false,
      sports_enabled: r.sports_enabled !== false,
    };
  }
  return {
    teacher_user_id: teacherUserId,
    academic_enabled: true,
    github_enabled: true,
    hackerrank_enabled: true,
    linkedin_enabled: true,
    leetcode_enabled: true,
    hackathon_enabled: true,
    sports_enabled: true,
  };
}

router.get('/visibility-settings', async (req: AuthRequest, res) => {
  const settings = await getTeacherVisibility(req.user!.id);
  res.json({ settings });
});

const defaultExams = [
  { type: 'Internal 1', max: 25 },
  { type: 'Internal 2', max: 25 },
  { type: 'Midterm', max: 50 },
  { type: 'Final', max: 100 },
  { type: 'Assignment', max: 20 },
  { type: 'Practical', max: 30 },
];

router.get('/assignments', async (req: AuthRequest, res) => {
  const rows = (await query(
    `SELECT a.*,c.name AS "className",c.year AS "classYear",c.section AS "classSection",
            s.name AS "subjectName",s.code AS "subjectCode",s.max_marks AS "maxMarks",
            sem.name AS "semesterName",
            (SELECT count(*)::int FROM students st WHERE st.class_id=c.id) AS "studentCount"
     FROM teacher_class_assignments a
     JOIN classes c ON c.id=a.class_id
     JOIN subjects s ON s.id=a.subject_id
     JOIN semesters sem ON sem.id=a.semester_id
     WHERE a.teacher_user_id=$1
     ORDER BY a.created_at DESC`,
    [req.user!.id],
  )).rows;
  res.json({ active: rows.filter(x => x.status === 'active'), past: rows.filter(x => x.status === 'past') });
});

router.get('/classes/:classId/students', async (req: AuthRequest, res) => {
  if (!await verifyTeacherClassScope(req.params.classId, undefined, undefined, req.user!.id))
    return res.status(403).json({ error: 'Access Denied: You are not assigned to instruct or view records for this class.' });
  const cls = (await query('SELECT * FROM classes WHERE id=$1', [req.params.classId])).rows[0];
  const students = (await query(
    `SELECT s.id,s.user_id,s.roll_number,u.full_name,u.email,
            s.linkedin_url,s.github_url,s.hackerrank_url,s.leetcode_url,s.profile_photo_url,
            s.profile_strength,s.bio,s.class_id, c.name AS class_name, c.year AS class_year, c.section AS class_section,
            d.name AS department_name
     FROM students s
     LEFT JOIN users u ON u.id=s.user_id
     LEFT JOIN classes c ON c.id=s.class_id
     LEFT JOIN departments d ON d.id=COALESCE(s.department_id, c.department_id)
     WHERE s.class_id=$1 ORDER BY s.roll_number`,
    [req.params.classId],
  )).rows;
  res.json({ class: cls, students });
});

router.get('/classes/:classId/subjects/:subjectId/marks', async (req: AuthRequest, res) => {
  const { classId, subjectId } = req.params;
  const semester = String(req.query.semester_id || '');
  if (!await verifyTeacherClassScope(classId, subjectId, semester || undefined, req.user!.id))
    return res.status(403).json({ error: 'Access Denied: You are not assigned to this class, subject, and semester.' });
  const students = (await query(`SELECT s.id,s.roll_number,u.full_name FROM students s LEFT JOIN users u ON u.id=s.user_id WHERE s.class_id=$1 ORDER BY s.roll_number`, [classId])).rows;
  const [marks, assessmentDefs] = await Promise.all([
    query<any>(`SELECT * FROM marks WHERE class_id=$1 AND subject_id=$2 ${semester ? 'AND semester_id=$3' : ''}`, semester ? [classId, subjectId, semester] : [classId, subjectId]),
    query<any>(`SELECT id, title, max_marks, weight, assessment_type, assessment_date, answer_key, rubric_criteria FROM assessment_definitions WHERE class_id=$1 AND subject_id=$2 AND semester_id=$3 AND status='active' ORDER BY created_at ASC`, [classId, subjectId, semester || ''] ),
  ]);

  const columnDefs = assessmentDefs.rows.length > 0
    ? assessmentDefs.rows.map((a: any) => ({
        type: a.title,
        max: Number(a.max_marks),
        weight: Number(a.weight || 1.0),
        assessmentType: a.assessment_type,
        assessmentDate: a.assessment_date,
        id: a.id,
        answerKey: a.answer_key,
        rubricCriteria: a.rubric_criteria || []
      }))
    : defaultExams.map(d => ({ ...d, weight: 1.0, rubricCriteria: [] }));

  const grid: any = {};
  for (const s of students) {
    grid[s.id] = {};
    for (const exam of columnDefs) {
      const m = marks.rows.find((x: any) => x.student_id === s.id && x.exam_type === exam.type);
      grid[s.id][exam.type] = {
        marks_obtained: m?.marks_obtained ?? null,
        max_marks: exam.max,
        id: m?.id ?? null,
        status: m?.status || (m?.marks_obtained !== null && m?.marks_obtained !== undefined ? 'entered' : 'pending'),
        suggested_marks: m?.suggested_marks ?? null,
        suggested_by_ai: m?.suggested_by_ai ?? false,
        ai_justification: m?.ai_justification ?? null,
        ai_criterion_scores: m?.ai_criterion_scores ?? [],
        teacher_override_reason: m?.teacher_override_reason ?? null,
        teacher_feedback: m?.teacher_feedback ?? null,
        feedback_published: m?.feedback_published ?? false,
        reviewed_at: m?.reviewed_at ?? null,
      };
    }
  }
  res.json({ students, examColumns: columnDefs, grid });
});

router.post('/classes/:classId/subjects/:subjectId/assessments', async (req: AuthRequest, res) => {
  const { classId, subjectId } = req.params;
  const safeSemesterId = req.body.semester_id || req.body.semesterId;
  const safeTitle = String(req.body.title || req.body.assessmentTitle || '').trim();
  const safeMaxMarks = Number(req.body.max_marks !== undefined ? req.body.max_marks : req.body.maxMarks);
  const safeWeight = Number(req.body.weight !== undefined ? req.body.weight : 1.0) || 1.0;
  const safeAssessmentType = (req.body.assessment_type && req.body.assessment_type !== 'Other') ? req.body.assessment_type : (req.body.assessmentType || 'Other');
  const safeAssessmentDate = req.body.assessment_date || req.body.assessmentDate;
  const safeAnswerKey = req.body.answer_key || req.body.answerKey;
  const safeRubricCriteria = Array.isArray(req.body.rubric_criteria) && req.body.rubric_criteria.length ? req.body.rubric_criteria : (req.body.rubricCriteria || []);

  if (!await verifyTeacherClassScope(classId, subjectId, safeSemesterId, req.user!.id))
    return res.status(403).json({ error: 'Access Denied: You are not assigned to this class and subject.' });

  if (!safeTitle) return res.status(400).json({ error: 'Assessment title is required.' });
  if (!Number.isFinite(safeMaxMarks) || safeMaxMarks <= 0) return res.status(400).json({ error: 'Assessment max marks must be a positive number.' });

  const existing = await query<any>(
    `SELECT id FROM assessment_definitions WHERE class_id=$1 AND subject_id=$2 AND semester_id=$3 AND title=$4 AND status='active'`,
    [classId, subjectId, safeSemesterId, safeTitle],
  );
  if (existing.rowCount) return res.status(409).json({ error: 'An active assessment with this title already exists for this class and subject.' });

  const asmt = await createAssessmentWithRubric({
    classId,
    subjectId,
    semesterId: safeSemesterId,
    teacherUserId: req.user!.id,
    title: safeTitle,
    maxMarks: safeMaxMarks,
    weight: safeWeight,
    assessmentType: safeAssessmentType,
    assessmentDate: safeAssessmentDate,
    answerKey: safeAnswerKey,
    rubricCriteria: safeRubricCriteria,
  });

  res.status(201).json({ message: 'Assessment definition created successfully with rubrics.', assessment: asmt });
});

router.get('/classes/:classId/subjects/:subjectId/assessments/:assessmentId/rubric', async (req: AuthRequest, res) => {
  const asmt = await getAssessmentWithRubric(req.params.assessmentId);
  if (!asmt) return res.status(404).json({ error: 'Assessment not found.' });
  res.json(asmt);
});

router.put('/classes/:classId/subjects/:subjectId/assessments/:assessmentId/rubric', async (req: AuthRequest, res) => {
  const { rubricCriteria, answerKey } = req.body;
  const ok = await updateAssessmentRubricAndKey(req.params.assessmentId, req.user!.id, rubricCriteria || [], answerKey);
  if (!ok) return res.status(400).json({ error: 'Failed to update rubric or unauthorized.' });
  res.json({ message: 'Rubric and answer key updated successfully.' });
});

router.get('/classes/:classId/subjects/:subjectId/assessments/:assessmentId/submissions', async (req: AuthRequest, res) => {
  const submissions = await getSubmissionsForAssessment(req.params.assessmentId);
  res.json(submissions);
});

router.post('/classes/:classId/subjects/:subjectId/assessments/:assessmentId/ai-mark', async (req: AuthRequest, res) => {
  const { submissionText, codeContent, studentId } = req.body;
  const asmt = await getAssessmentWithRubric(req.params.assessmentId);
  if (!asmt) return res.status(404).json({ error: 'Assessment not found.' });

  const suggestion = await evaluateSubmissionWithAi(
    { text: submissionText, code: codeContent },
    asmt.rubricCriteria,
    asmt.answerKey,
    asmt.maxMarks
  );

  res.json({ ...suggestion, studentId: studentId || '' });
});

router.post('/classes/:classId/subjects/:subjectId/marks', async (req: AuthRequest, res) => {
  const { classId, subjectId } = req.params;
  const semester_id = req.body.semester_id || req.body.semesterId;
  const rawUpdates = req.body.updates || req.body.marksData;
  if (!await verifyTeacherClassScope(classId, subjectId, semester_id, req.user!.id))
    return res.status(403).json({ error: 'Access Denied: You are not authorized to update marks for this class/subject.' });
  if (!Array.isArray(rawUpdates) || !rawUpdates.length) return res.status(400).json({ error: 'Updates array is required.' });

  const result = await saveOrUpdateMarks({
    classId,
    subjectId,
    semesterId: semester_id || 'sem_1',
    teacherUserId: req.user!.id,
    updates: rawUpdates.map((u: any) => ({
      studentId: u.student_id || u.studentId,
      examType: u.exam_type || u.examType || req.body.exam_type || req.body.examType || 'Internal 1',
      marksObtained: u.marks_obtained !== undefined ? u.marks_obtained : u.marksObtained,
      maxMarks: Number(u.max_marks || u.maxMarks || req.body.max_marks || req.body.maxMarks || 100),
      status: u.status || 'entered',
      suggestedMarks: u.suggested_marks !== undefined ? u.suggested_marks : u.suggestedMarks,
      suggestedByAi: u.suggested_by_ai !== undefined ? u.suggested_by_ai : u.suggestedByAi,
      aiJustification: u.ai_justification || u.aiJustification,
      aiCriterionScores: u.ai_criterion_scores || u.aiCriterionScores,
      teacherOverrideReason: u.teacher_override_reason || u.teacherOverrideReason,
      teacherFeedback: u.teacher_feedback || u.teacherFeedback,
      feedbackPublished: u.feedback_published !== undefined ? u.feedback_published : u.feedbackPublished,
      reviewedBy: req.user!.id,
    })),
  });

  if (result.errors.length && !result.savedCount)
    return res.status(400).json({ error: 'Validation failed on submitted marks', details: result.errors });

  res.json({ message: `Successfully recorded ${result.savedCount} mark entries.`, savedCount: result.savedCount, validationWarnings: result.errors });
});

router.post('/classes/:classId/subjects/:subjectId/import-marks-preview', async (req: AuthRequest, res) => {
  const { classId, subjectId } = req.params;
  const { semester_id, entries = [] } = req.body;
  if (!await verifyTeacherClassScope(classId, subjectId, semester_id, req.user!.id))
    return res.status(403).json({ error: 'Access Denied: You are not assigned to this class and subject.' });

  const preview = await previewCsvMarksImport(classId, subjectId, semester_id || 'sem_1', entries);
  res.json(preview);
});

router.post('/classes/:classId/subjects/:subjectId/import-marks', async (req: AuthRequest, res) => {
  const { classId, subjectId } = req.params;
  const { semester_id, entries = [] } = req.body;
  if (!await verifyTeacherClassScope(classId, subjectId, semester_id, req.user!.id))
    return res.status(403).json({ error: 'Access Denied: You are not assigned to this class and subject.' });

  const students = (await query<{ id: string; roll_number: string }>('SELECT id,roll_number FROM students WHERE class_id=$1', [classId])).rows;
  const updates: any[] = [];
  const errors: any[] = [];

  for (const [i, item] of entries.entries()) {
    const s = students.find(x => x.roll_number.toUpperCase() === String(item.rollNumber || item.roll_number || '').toUpperCase());
    if (!s) { errors.push({ row: i + 1, reason: `Student ${item.rollNumber || item.roll_number} not in class` }); continue; }
    updates.push({
      studentId: s.id,
      examType: item.examType || item.exam_type || 'Internal 1',
      marksObtained: item.marksObtained !== undefined ? item.marksObtained : item.marks_obtained,
      maxMarks: Number(item.maxMarks || item.max_marks) || 100,
      status: item.status || 'entered',
      reviewedBy: req.user!.id,
    });
  }

  const result = await saveOrUpdateMarks({
    classId,
    subjectId,
    semesterId: semester_id || 'sem_1',
    teacherUserId: req.user!.id,
    updates,
  });

  res.json({
    message: `Batch import completed. Successfully recorded ${result.savedCount} marks entries.`,
    importedCount: result.savedCount,
    errors: [...errors, ...result.errors],
  });
});

router.get('/classes/:classId/subjects/:subjectId/export-marks', async (req: AuthRequest, res) => {
  const { classId, subjectId } = req.params;
  const semester = String(req.query.semester_id || 'sem_1');
  if (!await verifyTeacherClassScope(classId, subjectId, semester, req.user!.id))
    return res.status(403).json({ error: 'Access Denied.' });

  const visibility = await getTeacherVisibility(req.user!.id);
  if (!visibility.academic_enabled) {
    return res.status(403).json({ error: 'Academic analytics visibility is disabled for this faculty account by administrator.' });
  }

  const [students, marks, asmtDefs] = await Promise.all([
    query<any>(`SELECT s.id, s.roll_number, u.full_name FROM students s LEFT JOIN users u ON u.id=s.user_id WHERE s.class_id=$1 ORDER BY s.roll_number`, [classId]),
    query<any>(`SELECT * FROM marks WHERE class_id=$1 AND subject_id=$2 AND semester_id=$3`, [classId, subjectId, semester]),
    query<any>(`SELECT title, max_marks FROM assessment_definitions WHERE class_id=$1 AND subject_id=$2 AND semester_id=$3 AND status='active'`, [classId, subjectId, semester]),
  ]);

  const exams = asmtDefs.rows.length ? asmtDefs.rows.map(a => a.title) : ['Internal 1', 'Internal 2', 'Midterm', 'Final'];
  const exportRows = students.rows.map(s => {
    const row: Record<string, any> = {
      roll_number: s.roll_number,
      full_name: s.full_name,
    };
    for (const exam of exams) {
      const m = marks.rows.find((x: any) => x.student_id === s.id && x.exam_type === exam);
      row[exam] = m ? (m.status === 'entered' ? m.marks_obtained : m.status) : 'unassessed';
    }
    return row;
  });

  res.json({ classId, subjectId, semesterId: semester, exams, records: exportRows });
});

router.get('/classes/:classId/subjects/:subjectId/class-analytics', async (req: AuthRequest, res) => {
  const { classId, subjectId } = req.params;
  const semester = String(req.query.semester_id || 'sem_1');
  if (!await verifyTeacherClassScope(classId, subjectId, semester, req.user!.id))
    return res.status(403).json({ error: 'Access Denied.' });

  const visibility = await getTeacherVisibility(req.user!.id);
  if (!visibility.academic_enabled) {
    return res.status(403).json({ error: 'Academic analytics visibility is disabled for this faculty account by administrator.' });
  }

  const analytics = await calculateClassSubjectAnalytics(classId, subjectId, semester);
  res.json(analytics);
});


// ── Analytics — full calculation set ─────────────────────────────────────────

router.post('/analytics', async (req: AuthRequest, res) => {
  const { classId, scope = 'whole_class', studentIds = [], selectedSemesters = [], selectedExamTypes = [], subjectId } = req.body;
  if (subjectId) {
    if (!await verifyTeacherClassScope(classId, subjectId, undefined, req.user!.id))
      return res.status(403).json({ error: 'Access Denied: Subject outside your assigned teaching scope.' });
  } else if (!await verifyTeacherClassScope(classId, undefined, undefined, req.user!.id)) {
    return res.status(403).json({ error: 'Access Denied: Class outside your assigned teaching scope.' });
  }

  const params: any[] = [classId, req.user!.id];
  const filters = [
    's.class_id=$1', 
    'm.class_id=$1',
    `EXISTS (SELECT 1 FROM teacher_class_assignments tca WHERE tca.teacher_user_id=$2 AND tca.class_id=$1 AND tca.subject_id=m.subject_id AND (tca.semester_id=m.semester_id OR tca.status IN ('active', 'past')))`
  ];


  if (scope === 'selected_students' || scope === 'single_student') {
    if (!studentIds || !(studentIds as string[]).length) {
      // Enforce the selection: if no students selected, return empty data
      filters.push(`1=0`);
    } else {
      params.push(studentIds); 
      filters.push(`s.id=ANY($${params.length})`);
    }
  }

  if (subjectId) { params.push(subjectId); filters.push(`m.subject_id=$${params.length}`); }
  if ((selectedSemesters as string[]).length) { params.push(selectedSemesters); filters.push(`m.semester_id=ANY($${params.length})`); }
  if ((selectedExamTypes as string[]).length) { params.push(selectedExamTypes); filters.push(`m.exam_type=ANY($${params.length})`); }

  const rows = (await query<any>(
    `SELECT m.*,s.roll_number,u.full_name FROM marks m
     JOIN students s ON s.id=m.student_id
     JOIN users u ON u.id=s.user_id
     WHERE ${filters.join(' AND ')}
     ORDER BY m.created_at`,
    params,
  )).rows;

  const scores = rows.map(x => Number(x.marks_obtained) / Number(x.max_marks) * 100);
  const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const sorted = [...scores].sort((a, b) => a - b);
  const stdDev = standardDeviation(scores);
  const med = median(scores);

  // Grade distribution
  const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  scores.forEach(x => gradeDistribution[x >= 85 ? 'A' : x >= 70 ? 'B' : x >= 55 ? 'C' : x >= 40 ? 'D' : 'F']++);

  // Per-student average (for chart)
  const studentMap: Record<string, { name: string; roll: string; scores: number[] }> = {};
  for (const row of rows) {
    if (!studentMap[row.student_id]) studentMap[row.student_id] = { name: row.full_name, roll: row.roll_number, scores: [] };
    studentMap[row.student_id].scores.push(Number(row.marks_obtained) / Number(row.max_marks) * 100);
  }
  const averageByStudent = Object.values(studentMap).map(st => ({
    name: st.name,
    roll: st.roll,
    average: Number((st.scores.reduce((a, b) => a + b, 0) / st.scores.length).toFixed(2)),
  })).sort((a, b) => b.average - a.average);

  // Per-exam-type average (for chart)
  const examMap: Record<string, number[]> = {};
  for (const row of rows) {
    examMap[row.exam_type] ??= [];
    examMap[row.exam_type].push(Number(row.marks_obtained) / Number(row.max_marks) * 100);
  }
  const averageByExamType = Object.entries(examMap).map(([examType, vals]) => ({
    examType,
    average: Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)),
    count: vals.length,
  }));

  // Statistically Sound Longitudinal Regression
  // Evaluates sequential chronological milestones rather than misleading rank-order student falloff
  let regression: any = null;
  let formattedRegressionPoints: any[] = [];
  let regressionLabel = 'Longitudinal Trend Projection';

  if (scope === 'single_student') {
    const studentRows = rows.filter(r => r.marks_obtained !== null);
    if (studentRows.length >= 2) {
      const timePoints = studentRows.map((r, i) => ({ x: i + 1, y: Number(r.marks_obtained) / Number(r.max_marks) * 100 }));
      regression = linearRegression(timePoints);
      formattedRegressionPoints = studentRows.map((r, i) => {
        const x = i + 1;
        const actual = Number((Number(r.marks_obtained) / Number(r.max_marks) * 100).toFixed(2));
        const trend = regression ? Number((regression.slope * x + regression.intercept).toFixed(2)) : actual;
        return { x, actual, trend, label: r.exam_type || `Assessment ${x}` };
      });
      regressionLabel = `Assessment Timeline Progression (${studentRows.length} sequential assessments)`;
    } else {
      regression = null;
      regressionLabel = 'Single assessment recorded (insufficient sequential data; longitudinal trend unestablished)';
      formattedRegressionPoints = studentRows.map((r) => ({
        x: 1,
        actual: Number((Number(r.marks_obtained) / Number(r.max_marks) * 100).toFixed(2)),
        trend: Number((Number(r.marks_obtained) / Number(r.max_marks) * 100).toFixed(2)),
        label: r.exam_type || 'Single Assessment'
      }));
    }
  } else {
    // Cohort / Whole Class: Check if multiple distinct chronological assessment types exist
    const distinctExamTypes = Array.from(new Set(rows.map(r => r.exam_type)));
    if (distinctExamTypes.length >= 2) {
      const examPoints = averageByExamType.map((e, i) => ({ x: i + 1, y: e.average }));
      regression = linearRegression(examPoints);
      formattedRegressionPoints = averageByExamType.map((e, i) => {
        const x = i + 1;
        const actual = e.average;
        const trend = regression ? Number((regression.slope * x + regression.intercept).toFixed(2)) : actual;
        return { x, actual, trend, label: e.examType };
      });
      regressionLabel = `Milestone Timeline Progression (${averageByExamType.length} assessment milestones)`;
    } else {
      regression = null;
      regressionLabel = 'Single assessment milestone recorded across cohort (longitudinal trend unestablished)';
      formattedRegressionPoints = averageByStudent.slice(0, 30).map((st, i) => ({
        x: i + 1,
        actual: st.average,
        trend: st.average,
        label: st.name || `Student ${i + 1}`
      }));
    }
  }

  const visibility = await getTeacherVisibility(req.user!.id);

  // Aggregate external student activity (LinkedIn posts & GitHub stats) for students in scope
  const studentIdsInScope = Array.from(new Set(rows.map(x => x.student_id)));
  let postsByMonth: Array<{ month: string; label: string; count: number }> = [];
  let totalPosts = 0;
  let githubSyncedCount = 0;
  let githubTotalRepos = 0;
  let githubTotalStars = 0;
  let githubTotalContributions = 0;
  let githubSnapshotsByMonth: Array<{ month: string; studentsSynced: number; totalRepos: number; totalStars: number; totalContributions: number }> = [];
  let githubDataSource = 'live_github_data';

  if (studentIdsInScope.length > 0) {
    if (visibility.linkedin_enabled) {
      const postsRes = await query<any>(
        `SELECT created_at FROM posts WHERE student_id = ANY($1) ORDER BY created_at ASC`,
        [studentIdsInScope],
      );
      totalPosts = postsRes.rows.length;
      const monthMap = new Map<string, number>();
      for (const p of postsRes.rows) {
        const month = new Date(p.created_at).toISOString().slice(0, 7);
        monthMap.set(month, (monthMap.get(month) ?? 0) + 1);
      }
      postsByMonth = Array.from(monthMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, count]) => {
          const [year, m] = month.split('-');
          const date = new Date(Number(year), Number(m) - 1, 1);
          const label = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          return { month, label, count };
        });
    }

    if (visibility.github_enabled) {
      const studentsRes = await query<any>(
        `SELECT github_data, github_url FROM students WHERE id = ANY($1)`,
        [studentIdsInScope],
      );
      for (const s of studentsRes.rows) {
        if (s.github_data) {
          githubSyncedCount++;
          githubTotalRepos += Number(s.github_data.public_repos ?? s.github_data.publicRepos ?? 0);
          githubTotalStars += Number(s.github_data.stars ?? 0);
          githubTotalContributions += Number(s.github_data.total_contributions ?? s.github_data.totalContributions ?? s.github_data.contribution_count ?? 0);
        }
      }

      // --- New: read from student_github_snapshots for current month ---
      // Overrides the live github_data aggregation with stored snapshot data
      const thisMonth = currentMonth();
      const snapshotRes = await query<any>(
        `SELECT gs.student_id, gs.public_repos, gs.total_stars, gs.total_forks,
                gs.followers, gs.total_contributions, gs.sync_status, gs.snapshot_month
         FROM student_github_snapshots gs
         WHERE gs.student_id = ANY($1) AND gs.snapshot_month = $2`,
        [studentIdsInScope, thisMonth]
      );

      // If snapshots exist for this month, use them instead of live github_data
      if (snapshotRes.rows.length > 0) {
        githubSyncedCount = 0;
        githubTotalRepos = 0;
        githubTotalStars = 0;
        githubTotalContributions = 0;
        for (const snap of snapshotRes.rows) {
          if (snap.sync_status === 'synced') {
            githubSyncedCount++;
            githubTotalRepos += Number(snap.public_repos ?? 0);
            githubTotalStars += Number(snap.total_stars ?? 0);
            githubTotalContributions += Number(snap.total_contributions ?? 0);
          }
        }
      }

      // Monthly snapshot history (for trend charts)
      const monthlySnapshotRes = await query<any>(
        `SELECT gs.snapshot_month,
                COUNT(*) FILTER (WHERE gs.sync_status='synced') AS students_synced,
                SUM(gs.public_repos) AS total_repos,
                SUM(gs.total_stars) AS total_stars,
                SUM(gs.total_contributions) AS total_contributions
         FROM student_github_snapshots gs
         WHERE gs.student_id = ANY($1)
         GROUP BY gs.snapshot_month
         ORDER BY gs.snapshot_month ASC`,
        [studentIdsInScope]
      );
      const githubSnapshotsByMonthData = monthlySnapshotRes.rows.map((r: any) => ({
        month: r.snapshot_month,
        studentsSynced: Number(r.students_synced ?? 0),
        totalRepos: Number(r.total_repos ?? 0),
        totalStars: Number(r.total_stars ?? 0),
        totalContributions: Number(r.total_contributions ?? 0),
      }));
      githubSnapshotsByMonth = githubSnapshotsByMonthData;
      if (githubSnapshotsByMonthData.length > 0) githubDataSource = 'snapshots';
    }
  }

  res.json({
    scope,
    totalStudentsIncluded: new Set(rows.map(x => x.student_id)).size,
    ...(visibility.academic_enabled ? {
      statistics: {
        count: scores.length,
        mean: Number(mean.toFixed(2)),
        median: Number(med.toFixed(2)),
        stdDev: Number(stdDev.toFixed(2)),
        min: sorted[0] !== undefined ? Number(sorted[0].toFixed(2)) : 0,
        max: sorted.at(-1) !== undefined ? Number(sorted.at(-1)!.toFixed(2)) : 0,
      },
      linearRegression: regression
        ? {
            slope: Number(regression.slope.toFixed(4)),
            intercept: Number(regression.intercept.toFixed(4)),
            rSquared: Number(regression.rSquared.toFixed(4)),
            predictedNextScore: Number(regression.predictedNextValue.toFixed(2)),
            points: formattedRegressionPoints,
            label: regressionLabel,
          }
        : {
            slope: 0,
            intercept: Number(mean.toFixed(2)),
            rSquared: null,
            predictedNextScore: Number(mean.toFixed(2)),
            points: formattedRegressionPoints,
            label: regressionLabel,
          },
    } : {}),
    charts: { 
      ...(visibility.academic_enabled ? { gradeDistribution, averageByExamType, averageByStudent } : {}) 
    },
    externalActivity: {
      ...(visibility.linkedin_enabled ? {
        totalPosts,
        postsByMonth,
      } : {}),
      ...(visibility.github_enabled ? {
        githubSyncedCount,
        githubTotalRepos,
        githubTotalStars,
        githubTotalContributions,
        githubSnapshotsByMonth,
        githubDataSource,
      } : {}),
    },
    rawExportData: visibility.academic_enabled ? rows.map(x => ({
      StudentName: x.full_name,
      RollNumber: x.roll_number,
      ExamType: x.exam_type,
      Semester: x.semester_id,
      MarksObtained: x.marks_obtained,
      MaxMarks: x.max_marks,
      Percentage: (x.marks_obtained / x.max_marks * 100).toFixed(1),
      Grade: (x.marks_obtained / x.max_marks * 100) >= 85 ? 'A' : (x.marks_obtained / x.max_marks * 100) >= 70 ? 'B' : (x.marks_obtained / x.max_marks * 100) >= 55 ? 'C' : (x.marks_obtained / x.max_marks * 100) >= 40 ? 'D' : 'F',
      PassFail: (x.marks_obtained / x.max_marks * 100) >= 40 ? 'Pass' : 'Fail',
    })) : [],
  });
});

// ── Per-Student Analytics (scoped to teacher's class + subject + semester) ───────
router.get('/students/:studentId/analytics', async (req: AuthRequest, res) => {
  const { studentId } = req.params;
  const { classId, subjectId, semesterId } = req.query as Record<string, string>;

  if (!classId || !subjectId || !semesterId) {
    return res.status(400).json({ error: 'classId, subjectId, and semesterId are required query parameters.' });
  }

  // RBAC: verify teacher is assigned to this class + subject + semester
  if (!await verifyTeacherClassScope(classId, subjectId, semesterId, req.user!.id)) {
    return res.status(403).json({ error: 'Access Denied: You are not assigned to this class, subject, and semester.' });
  }

  // Confirm student belongs to this class and fetch department/semester/subject info
  const student = (await query<any>(
    `SELECT s.*, u.full_name, u.email,
            c.name AS "className", c.year AS "classYear", c.section AS "classSection",
            d.name AS "departmentName",
            sem.name AS "semesterName",
            subj.name AS "subjectName", subj.code AS "subjectCode"
     FROM students s
     LEFT JOIN users u ON u.id = s.user_id
     LEFT JOIN classes c ON c.id = s.class_id
     LEFT JOIN departments d ON d.id = COALESCE(s.department_id, c.department_id)
     LEFT JOIN semesters sem ON sem.id = $3
     LEFT JOIN subjects subj ON subj.id = $4
     WHERE s.id = $1 AND s.class_id = $2`,
    [studentId, classId, semesterId, subjectId],
  )).rows[0];

  if (!student) {
    return res.status(404).json({ error: 'Student not found or not enrolled in this class.' });
  }

  const visibility = await getTeacherVisibility(req.user!.id);

  const [assessmentDefs, marksRows, postsRows] = await Promise.all([
    query<any>(
      `SELECT id, title, max_marks, assessment_type
       FROM assessment_definitions
       WHERE class_id = $1 AND subject_id = $2 AND semester_id = $3 AND status = 'active'
       ORDER BY created_at ASC`,
      [classId, subjectId, semesterId],
    ),
    query<any>(
      `SELECT exam_type, marks_obtained, max_marks
       FROM marks
       WHERE student_id = $1 AND class_id = $2 AND subject_id = $3 AND semester_id = $4
       ORDER BY created_at ASC`,
      [studentId, classId, subjectId, semesterId],
    ),
    query<any>(
      `SELECT id, title, description, category, created_at
       FROM posts
       WHERE student_id = $1
       ORDER BY created_at ASC`,
      [studentId],
    ),
  ]);

  // Build internal marks list: only display assessments that actually exist in PostgreSQL for this student
  const marksMap = new Map<string, { marks_obtained: number; max_marks: number }>();
  for (const m of marksRows.rows) {
    marksMap.set(m.exam_type, { marks_obtained: Number(m.marks_obtained), max_marks: Number(m.max_marks) });
  }

  let internalMarks: Array<{ title: string; exam_type: string; marks_obtained: number; max_marks: number; assessment_type: string }> = [];

  if (assessmentDefs.rows.length > 0) {
    for (const def of assessmentDefs.rows) {
      const recorded = marksMap.get(def.title);
      if (recorded) {
        internalMarks.push({
          title: def.title,
          exam_type: def.title,
          marks_obtained: recorded.marks_obtained,
          max_marks: Number(def.max_marks),
          assessment_type: def.assessment_type,
        });
      }
    }
    // Also include any marks not in assessmentDefs
    for (const m of marksRows.rows) {
      if (!assessmentDefs.rows.some((d: any) => d.title === m.exam_type)) {
        internalMarks.push({
          title: m.exam_type,
          exam_type: m.exam_type,
          marks_obtained: Number(m.marks_obtained),
          max_marks: Number(m.max_marks),
          assessment_type: 'Other',
        });
      }
    }
  } else {
    for (const m of marksRows.rows) {
      internalMarks.push({
        title: m.exam_type,
        exam_type: m.exam_type,
        marks_obtained: Number(m.marks_obtained),
        max_marks: Number(m.max_marks),
        assessment_type: 'Other',
      });
    }
  }

  const totalObtained = internalMarks.reduce((s, m) => s + m.marks_obtained, 0);
  const totalMax = internalMarks.reduce((s, m) => s + m.max_marks, 0);
  const averagePct = internalMarks.length > 0
    ? internalMarks.reduce((acc, m) => acc + (m.max_marks > 0 ? (m.marks_obtained / m.max_marks) * 100 : 0), 0) / internalMarks.length
    : 0;

  let internalSummary = internalMarks.length > 0
    ? {
        totalObtained: Number(totalObtained.toFixed(2)),
        totalMax: Number(totalMax.toFixed(2)),
        percentage: Number((totalObtained / totalMax * 100).toFixed(2)),
        average: Number(averagePct.toFixed(2)),
        count: internalMarks.length,
      }
    : null;

  // GitHub Data — read from monthly snapshots first, fall back to legacy github_data
  const thisMonth = currentMonth();
  const snapshotRes = await query<any>(
    `SELECT * FROM student_github_snapshots
     WHERE student_id = $1
     ORDER BY snapshot_month DESC`,
    [studentId]
  );
  const currentSnap = snapshotRes.rows.find((r: any) => r.snapshot_month === thisMonth)
    ?? snapshotRes.rows[0] ?? null;

  let githubData: any = null;
  if (currentSnap) {
    if (currentSnap.sync_status === 'synced') {
      githubData = {
        synced: true,
        dataSource: 'monthly_snapshot',
        snapshotMonth: currentSnap.snapshot_month,
        syncedAt: currentSnap.synced_at,
        username: currentSnap.github_username,
        followers: currentSnap.followers,
        publicRepos: currentSnap.public_repos,
        stars: currentSnap.total_stars,
        forks: currentSnap.total_forks,
        languages: currentSnap.languages ?? [],
        topRepos: currentSnap.top_repos ?? [],
        totalContributions: currentSnap.total_contributions, // null if no GITHUB_TOKEN
        github_url: student.github_url,
        snapshotHistory: snapshotRes.rows.map((r: any) => ({
          month: r.snapshot_month,
          syncStatus: r.sync_status,
          publicRepos: r.public_repos,
          totalStars: r.total_stars,
          totalContributions: r.total_contributions,
          syncedAt: r.synced_at,
        })),
      };
    } else if (currentSnap.sync_status === 'failed') {
      githubData = {
        synced: false,
        dataSource: 'monthly_snapshot',
        snapshotMonth: currentSnap.snapshot_month,
        reason: currentSnap.error_message || 'GitHub sync failed',
        github_url: student.github_url,
      };
    } else {
      // not_synced — no GitHub URL
      githubData = null;
    }
  } else if (student.github_data) {
    // Legacy fallback: no snapshot yet, use existing github_data JSONB
    githubData = {
      synced: true,
      dataSource: 'legacy_github_data',
      syncedAt: student.github_synced_at,
      username: student.github_data.username || student.github_data.login || null,
      followers: student.github_data.followers ?? null,
      publicRepos: student.github_data.public_repos ?? student.github_data.publicRepos ?? null,
      stars: student.github_data.stars ?? null,
      forks: student.github_data.forks ?? null,
      languages: student.github_data.languages ?? [],
      topRepos: student.github_data.top_repos ?? student.github_data.repos ?? [],
      totalContributions: student.github_data.total_contributions ?? student.github_data.totalContributions ?? null,
      github_url: student.github_url,
      snapshotHistory: [],
    };
  } else if (student.github_url) {
    githubData = { synced: false, dataSource: 'not_synced', github_url: student.github_url, reason: 'Not yet synced — run monthly sync or trigger via profile' };
  }

  if (!visibility.github_enabled) {
    githubData = null;
  }

  // LinkedIn Data
  let linkedinData: any = null;
  const linkedinSnapshotRes = await query<any>(
    `SELECT * FROM student_linkedin_snapshots
     WHERE student_id = $1
     ORDER BY snapshot_month DESC`,
    [studentId]
  );
  const currentLinkedinSnap = linkedinSnapshotRes.rows.find((r: any) => r.snapshot_month === thisMonth)
    ?? linkedinSnapshotRes.rows[0] ?? null;

  if (currentLinkedinSnap) {
    if (currentLinkedinSnap.sync_status === 'synced') {
      linkedinData = {
        synced: true,
        status: 'VERIFIED',
        dataSource: 'linkedin_snapshot',
        snapshotMonth: currentLinkedinSnap.snapshot_month,
        syncedAt: currentLinkedinSnap.synced_at,
        url: currentLinkedinSnap.linkedin_url || student.linkedin_url,
        connections: currentLinkedinSnap.connections,
        postsCount: currentLinkedinSnap.posts_count,
        followers: currentLinkedinSnap.followers,
        snapshotHistory: linkedinSnapshotRes.rows.map((r: any) => ({
          month: r.snapshot_month,
          syncStatus: r.sync_status,
          connections: r.connections,
          followers: r.followers,
          syncedAt: r.synced_at,
        })),
      };
    } else if (currentLinkedinSnap.sync_status === 'failed') {
      linkedinData = {
        synced: false,
        status: 'FAILED',
        dataSource: 'linkedin_snapshot',
        snapshotMonth: currentLinkedinSnap.snapshot_month,
        reason: currentLinkedinSnap.error_message || 'LinkedIn sync failed',
        url: student.linkedin_url,
      };
    } else {
      linkedinData = {
        synced: false,
        status: 'UNAVAILABLE',
        dataSource: 'linkedin_oauth_api',
        url: student.linkedin_url,
        reason: 'LinkedIn live sync requires authorized student OAuth integration',
      };
    }
  } else if (student.linkedin_url) {
    linkedinData = {
      synced: false,
      status: 'UNVERIFIED',
      dataSource: 'linkedin_oauth_api',
      url: student.linkedin_url,
      reason: 'LinkedIn profile linked but live API sync requires student OAuth authorization',
    };
  } else {
    linkedinData = {
      synced: false,
      status: 'NOT_CONNECTED',
      dataSource: 'linkedin_oauth_api',
      url: null,
      reason: 'No LinkedIn profile linked',
    };
  }

  if (!visibility.linkedin_enabled) {
    linkedinData = null;
  }

  // HackerRank Data
  let hackerrankData: any = null;
  const hackerrankSnapshotRes = await query<any>(
    `SELECT * FROM student_hackerrank_snapshots
     WHERE student_id = $1
     ORDER BY snapshot_month DESC`,
    [studentId]
  );
  const currentHackerrankSnap = hackerrankSnapshotRes.rows.find((r: any) => r.snapshot_month === thisMonth)
    ?? hackerrankSnapshotRes.rows[0] ?? null;

  if (currentHackerrankSnap) {
    if (currentHackerrankSnap.sync_status === 'synced') {
      hackerrankData = {
        synced: true,
        status: 'VERIFIED',
        dataSource: 'hackerrank_rest_api',
        snapshotMonth: currentHackerrankSnap.snapshot_month,
        syncedAt: currentHackerrankSnap.synced_at,
        username: currentHackerrankSnap.hackerrank_username,
        badgesCount: currentHackerrankSnap.badges_count,
        verifiedSkills: currentHackerrankSnap.verified_skills ?? [],
        url: student.hackerrank_url,
        snapshotHistory: hackerrankSnapshotRes.rows.map((r: any) => ({
          month: r.snapshot_month,
          syncStatus: r.sync_status,
          badgesCount: r.badges_count,
          syncedAt: r.synced_at,
        })),
      };
    } else if (currentHackerrankSnap.sync_status === 'failed') {
      hackerrankData = {
        synced: false,
        status: 'FAILED',
        dataSource: 'hackerrank_rest_api',
        snapshotMonth: currentHackerrankSnap.snapshot_month,
        reason: currentHackerrankSnap.error_message || 'HackerRank sync failed',
        url: student.hackerrank_url,
      };
    } else {
      hackerrankData = null;
    }
  } else if (student.hackerrank_url) {
    hackerrankData = {
      synced: false,
      status: 'UNVERIFIED',
      dataSource: 'hackerrank_rest_api',
      url: student.hackerrank_url,
      reason: 'Not yet synced with HackerRank',
    };
  } else {
    hackerrankData = {
      synced: false,
      status: 'NOT_CONNECTED',
      dataSource: 'hackerrank_rest_api',
      url: null,
      reason: 'No HackerRank profile linked',
    };
  }

  if (!visibility.hackerrank_enabled) {
    hackerrankData = null;
  }

  // LeetCode Data
  let leetcodeData: any = null;
  const leetcodeSnapshotRes = await query<any>(
    `SELECT * FROM student_leetcode_snapshots
     WHERE student_id = $1
     ORDER BY snapshot_month DESC`,
    [studentId]
  );
  const currentLeetcodeSnap = leetcodeSnapshotRes.rows.find((r: any) => r.snapshot_month === thisMonth)
    ?? leetcodeSnapshotRes.rows[0] ?? null;

  if (currentLeetcodeSnap) {
    if (currentLeetcodeSnap.sync_status === 'synced') {
      leetcodeData = {
        synced: true,
        status: 'VERIFIED',
        dataSource: 'leetcode_graphql_api',
        snapshotMonth: currentLeetcodeSnap.snapshot_month,
        syncedAt: currentLeetcodeSnap.synced_at,
        username: currentLeetcodeSnap.leetcode_username,
        ranking: currentLeetcodeSnap.ranking,
        totalSolved: currentLeetcodeSnap.total_solved,
        easySolved: currentLeetcodeSnap.easy_solved,
        mediumSolved: currentLeetcodeSnap.medium_solved,
        hardSolved: currentLeetcodeSnap.hard_solved,
        url: student.leetcode_url,
      };
    } else if (currentLeetcodeSnap.sync_status === 'failed') {
      leetcodeData = {
        synced: false,
        status: 'FAILED',
        dataSource: 'leetcode_graphql_api',
        snapshotMonth: currentLeetcodeSnap.snapshot_month,
        reason: currentLeetcodeSnap.error_message || 'LeetCode sync failed',
        url: student.leetcode_url,
      };
    }
  } else if (student.leetcode_data && student.leetcode_data.status === 'SYNCED') {
    leetcodeData = {
      synced: true,
      status: 'VERIFIED',
      dataSource: 'leetcode_graphql_api',
      syncedAt: student.leetcode_synced_at,
      username: student.leetcode_data.username,
      ranking: student.leetcode_data.ranking,
      totalSolved: student.leetcode_data.totalSolved,
      easySolved: student.leetcode_data.easySolved,
      mediumSolved: student.leetcode_data.mediumSolved,
      hardSolved: student.leetcode_data.hardSolved,
      url: student.leetcode_url,
    };
  } else if (student.leetcode_data && student.leetcode_data.status === 'FAILED') {
    leetcodeData = {
      synced: false,
      status: 'FAILED',
      dataSource: 'leetcode_graphql_api',
      syncedAt: student.leetcode_synced_at,
      reason: student.leetcode_data.error || 'LeetCode sync failed',
      url: student.leetcode_url,
    };
  } else if (student.leetcode_url) {
    leetcodeData = {
      synced: false,
      status: 'UNVERIFIED',
      dataSource: 'leetcode_graphql_api',
      url: student.leetcode_url,
      reason: 'Not yet synced with LeetCode',
    };
  } else {
    leetcodeData = {
      synced: false,
      status: 'NOT_CONNECTED',
      dataSource: 'leetcode_graphql_api',
      url: null,
      reason: 'No LeetCode profile linked',
    };
  }

  if (!visibility.leetcode_enabled) {
    leetcodeData = null;
  }

  // Campus Posts grouped by month (YYYY-MM)
  const monthMap = new Map<string, number>();
  for (const p of postsRows.rows) {
    const month = new Date(p.created_at).toISOString().slice(0, 7); // YYYY-MM
    monthMap.set(month, (monthMap.get(month) ?? 0) + 1);
  }
  const postsByMonth = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => {
      const [year, m] = month.split('-');
      const date = new Date(Number(year), Number(m) - 1, 1);
      const label = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      return { month, label, count };
    });

  if (!visibility.academic_enabled) {
    internalMarks = [];
    internalSummary = null;
  }

  const academicHistory = visibility.academic_enabled ? await calculateAcademicHistory(studentId) : null;

  const studentObj: any = {
    id: student.id,
    full_name: student.full_name,
    roll_number: student.roll_number,
    email: student.email,
    className: student.className,
    classYear: student.classYear,
    classSection: student.classSection,
    departmentName: student.departmentName,
    semesterName: student.semesterName,
    profile_photo_url: student.profile_photo_url,
    profile_strength: student.profile_strength,
  };
  if (visibility.github_enabled) {
    studentObj.github_url = student.github_url;
    studentObj.github_synced_at = student.github_synced_at;
  }
  if (visibility.linkedin_enabled) {
    studentObj.linkedin_url = student.linkedin_url;
    studentObj.linkedin_synced_at = student.linkedin_synced_at;
  }
  if (visibility.hackerrank_enabled) {
    studentObj.hackerrank_url = student.hackerrank_url;
    studentObj.hackerrank_synced_at = student.hackerrank_synced_at;
  }
  if (visibility.leetcode_enabled) {
    studentObj.leetcode_url = student.leetcode_url;
    studentObj.leetcode_synced_at = student.leetcode_synced_at;
  }

  res.json({
    student: studentObj,
    context: {
      classId,
      subjectId,
      semesterId,
      className: student.className,
      subjectName: student.subjectName,
      subjectCode: student.subjectCode,
      semesterName: student.semesterName,
    },
    ...(visibility.academic_enabled ? {
      internalMarks,
      internalSummary,
      academicHistory,
    } : {}),
    ...(visibility.github_enabled && githubData ? {
      githubData,
    } : {}),
    ...(visibility.hackerrank_enabled && hackerrankData ? {
      hackerrankData,
      hackerrankUrl: student.hackerrank_url,
    } : {}),
    ...(visibility.leetcode_enabled && leetcodeData ? {
      leetcodeData,
      leetcodeUrl: student.leetcode_url,
    } : {}),
    ...(visibility.linkedin_enabled && linkedinData ? {
      linkedinData,
      linkedinUrl: student.linkedin_url,
    } : {}),
    campusPosts: postsRows.rows,
    recentPosts: postsRows.rows.slice(-5).reverse(),
    postsByMonth,
    totalPosts: postsRows.rows.length,
  });
});

router.get('/students/:studentId/full-profile', async (req: AuthRequest, res) => {
  const s = (await query<any>(
    `SELECT s.*,u.full_name,u.email,c.name AS "className",d.name AS "departmentName"
     FROM students s LEFT JOIN users u ON u.id=s.user_id
     LEFT JOIN classes c ON c.id=s.class_id
     LEFT JOIN departments d ON d.id=COALESCE(s.department_id, c.department_id)
     WHERE s.id=$1`,
    [req.params.studentId],
  )).rows[0];
  if (!s) return res.status(404).json({ error: 'Student record not found.' });
  if (!await verifyTeacherClassScope(s.class_id, undefined, undefined, req.user!.id))
    return res.status(403).json({ error: 'Access Denied: This student is not enrolled in your assigned classes.' });

  const visibility = await getTeacherVisibility(req.user!.id);

  const [projects, achievements, certifications, hackathons, documents, marks, sports, hrEvidence, liPosts, posts] = await Promise.all([
    query(`SELECT * FROM projects WHERE student_id=$1 ORDER BY created_at DESC`, [s.id]),
    query(`SELECT * FROM achievements WHERE student_id=$1 ORDER BY created_at DESC`, [s.id]),
    query(`SELECT * FROM certifications WHERE student_id=$1 ORDER BY created_at DESC`, [s.id]),
    visibility.hackathon_enabled ? query(`SELECT * FROM hackathons WHERE student_id=$1 ORDER BY created_at DESC`, [s.id]) : Promise.resolve({ rows: [] }),
    query(`SELECT * FROM student_documents WHERE student_id=$1 ORDER BY created_at DESC`, [s.id]),
    visibility.academic_enabled ? query(`SELECT * FROM marks WHERE student_id=$1 ORDER BY created_at DESC`, [s.id]) : Promise.resolve({ rows: [] }),
    query(`SELECT * FROM sports WHERE student_id=$1 ORDER BY created_at DESC`, [s.id]),
    visibility.hackerrank_enabled ? query(`SELECT * FROM student_hackerrank_evidence WHERE student_id=$1 ORDER BY created_at DESC`, [s.id]) : Promise.resolve({ rows: [] }),
    visibility.linkedin_enabled ? query(`SELECT * FROM student_linkedin_posts WHERE student_id=$1 ORDER BY post_date DESC, created_at DESC`, [s.id]) : Promise.resolve({ rows: [] }),
    query(`
      SELECT p.*,
             (SELECT json_agg(a.*) FROM post_attachments a WHERE a.post_id = p.id) as attachments
      FROM posts p
      WHERE p.student_id = $1
      ORDER BY p.created_at DESC
    `, [s.id]),
  ]);

  const academicHistory = visibility.academic_enabled ? await calculateAcademicHistory(s.id) : null;

  const profile_links: Record<string, string | null | undefined> = {
    portfolio: s.portfolio_url,
    resume: s.resume_url,
  };
  if (visibility.github_enabled) profile_links.github = s.github_url;
  if (visibility.linkedin_enabled) profile_links.linkedin = s.linkedin_url;
  if (visibility.hackerrank_enabled) profile_links.hackerrank = s.hackerrank_url;
  if (visibility.leetcode_enabled) profile_links.leetcode = s.leetcode_url;

  const sanitizedStudent = { ...s };
  if (!visibility.github_enabled) {
    delete sanitizedStudent.github_url;
    delete sanitizedStudent.github_data;
  }
  if (!visibility.linkedin_enabled) {
    delete sanitizedStudent.linkedin_url;
  }
  if (!visibility.hackerrank_enabled) {
    delete sanitizedStudent.hackerrank_url;
    delete sanitizedStudent.hackerrank_data;
  }
  if (!visibility.leetcode_enabled) {
    delete sanitizedStudent.leetcode_url;
    delete sanitizedStudent.leetcode_data;
  }
  if (!visibility.academic_enabled) {
    delete sanitizedStudent.cgpa;
    delete sanitizedStudent.sgpa;
    delete sanitizedStudent.total_backlogs;
  }

  res.json({
    ...sanitizedStudent,
    projects: projects.rows,
    achievements: achievements.rows,
    certifications: certifications.rows,
    hackathons: hackathons.rows,
    sports: sports.rows,
    hackerrank_evidence: hrEvidence.rows,
    linkedin_posts: liPosts.rows,
    documents: documents.rows,
    marks: marks.rows,
    marksheets: [],
    profile_links,
    posts: posts.rows,
    academicHistory,
  });
});
router.get('/students/:studentId/documents/:documentId/file', async (req: AuthRequest, res) => {
  const student = (await query<any>('SELECT id,class_id FROM students WHERE id=$1', [req.params.studentId])).rows[0];
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  if (!await verifyTeacherClassScope(student.class_id, undefined, undefined, req.user!.id)) {
    return res.status(403).json({ error: 'Access Denied: This student is not enrolled in your assigned classes.' });
  }

  const document = (await query<any>('SELECT * FROM student_documents WHERE id=$1 AND student_id=$2', [req.params.documentId, student.id])).rows[0];
  if (!document) return res.status(404).json({ error: 'Document not found or access denied.' });

  const fileName = path.basename(document.file_url);
  const filePath = path.join(process.cwd(), 'uploads', 'student-docs', fileName);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Document file is unavailable on disk.' });

  res.setHeader('Content-Disposition', `inline; filename="${document.file_name || fileName}"`);
  res.sendFile(filePath);
});

router.get('/students/:studentId/post-attachments/:attachmentId/file', async (req: AuthRequest, res) => {
  const student = (await query<any>('SELECT id,class_id FROM students WHERE id=$1', [req.params.studentId])).rows[0];
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  if (!await verifyTeacherClassScope(student.class_id, undefined, undefined, req.user!.id)) {
    return res.status(403).json({ error: 'Access Denied: This student is not enrolled in your assigned classes.' });
  }

  const attachment = (await query(`
    SELECT a.* FROM post_attachments a 
    JOIN posts p ON a.post_id = p.id 
    WHERE a.id=$1 AND p.student_id=$2
  `, [req.params.attachmentId, student.id])).rows[0];
  
  if (!attachment) return res.status(404).json({ error: 'Attachment not found or access denied.' });

  const fileName = path.basename(attachment.file_url);
  const filePath = path.join(process.cwd(), 'uploads', 'student-docs', fileName);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File is unavailable on disk.' });

  res.setHeader('Content-Disposition', `inline; filename="${attachment.file_name}"`);
  res.sendFile(filePath);
});
router.get('/notifications', async (req: AuthRequest, res) => res.json((await query(
  `SELECT DISTINCT n.*,u.full_name AS "creatorName",c.name AS "targetClassName",(nr.id IS NOT NULL) AS is_read
   FROM notifications n
   LEFT JOIN users u ON u.id=n.created_by
   LEFT JOIN classes c ON c.id=n.target_class_id
   LEFT JOIN notification_reads nr ON nr.notification_id=n.id AND nr.user_id=$1
   LEFT JOIN teacher_class_assignments a ON a.teacher_user_id=$1
   WHERE n.target_role IN ('all','all_teachers') OR (n.target_role='class' AND a.class_id=n.target_class_id)
   ORDER BY n.created_at DESC`,
  [req.user!.id],
)).rows));

router.post('/notifications/:id/read', async (req: AuthRequest, res) => {
  await query('INSERT INTO notification_reads (id,notification_id,user_id) VALUES ($1,$2,$3) ON CONFLICT (notification_id,user_id) DO NOTHING', [id('nr'), req.params.id, req.user!.id]);
  res.json({ message: 'Marked as read' });
});

router.post('/announcements', async (req: AuthRequest, res) => {
  const { title, body, class_id } = req.body;
  if (!title || !body || !class_id) return res.status(400).json({ error: 'Title, message body, and assigned class are required.' });
  if (!await verifyTeacherClassScope(class_id, undefined, undefined, req.user!.id))
    return res.status(403).json({ error: 'You can only publish announcements to your assigned classes.' });
  const n = { id: id('notif'), title, body, target_role: 'class', target_class_id: class_id, file_url: null, created_by: req.user!.id, created_at: new Date().toISOString() };
  await query(
    'INSERT INTO notifications (id,title,body,target_role,target_class_id,file_url,created_by,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [n.id, n.title, n.body, n.target_role, n.target_class_id, n.file_url, n.created_by, n.created_at]
  );
  res.status(201).json({ message: 'Announcement posted to class successfully.', notification: n });
});

router.get('/events', async (_req, res) => res.json([]));
router.post('/ai-query', rateLimit(50, 60000, 'teacher-ai'), async (req: AuthRequest, res) => res.json(await processAiQuery(req.user!, String(req.body.query || ''))));

router.post('/ai/student-progress', rateLimit(300, 60000, 'teacher-ai-progress'), async (req: AuthRequest, res) => {
  try {
    const { classId, subjectId, semesterId, scope = 'whole_class', studentIds = [], question } = req.body;
    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ error: 'Question is required.' });
    }
    const result = await processTeacherAiProgress(req.user!, {
      classId: String(classId || ''),
      subjectId: String(subjectId || ''),
      semesterId: String(semesterId || ''),
      scope: scope as any,
      studentIds: Array.isArray(studentIds) ? studentIds : [],
      question: question.trim(),
    });
    res.json(result);
  } catch (err: any) {
    const status = err.status || 400;
    res.status(status).json({ error: err.message || 'Failed to process AI student progress inquiry.' });
  }
});

router.post('/students/:studentId/portfolio/:type/:itemId/verify', async (req: AuthRequest, res) => {
  const { studentId, type, itemId } = req.params;
  const { status } = req.body;
  
  const student = (await query<any>('SELECT id,class_id FROM students WHERE id=$1', [studentId])).rows[0];
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  if (!await verifyTeacherClassScope(student.class_id, undefined, undefined, req.user!.id)) {
    return res.status(403).json({ error: 'Access Denied.' });
  }

  const validTables = ['projects', 'achievements', 'certifications', 'hackathons', 'sports', 'student_hackerrank_evidence', 'student_linkedin_posts', 'posts'];
  if (!validTables.includes(type)) return res.status(400).json({ error: 'Invalid portfolio type.' });

  if (['sports', 'student_hackerrank_evidence', 'student_linkedin_posts'].includes(type)) {
    await query(`UPDATE ${type} SET verification_status=$1, verified_by=$2, verified_at=NOW() WHERE id=$3 AND student_id=$4`, [status, req.user!.id, itemId, student.id]);
  } else {
    await query(`UPDATE ${type} SET verification_status=$1 WHERE id=$2 AND student_id=$3`, [status, itemId, student.id]);
  }
  res.json({ message: 'Verification status updated successfully' });
});

router.get('/students/:studentId/intelligence-evidence', async (req: AuthRequest, res) => {
  const student = (await query<any>('SELECT id,class_id FROM students WHERE id=$1', [req.params.studentId])).rows[0];
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  if (!await verifyTeacherClassScope(student.class_id, undefined, undefined, req.user!.id)) {
    return res.status(403).json({ error: 'Access Denied: This student is not enrolled in your assigned classes.' });
  }

  const visibility = await getTeacherVisibility(req.user!.id);
  const evidence = await getStudentComprehensiveEvidence(student.id);

  if (evidence) {
    if (!visibility.academic_enabled) {
      delete (evidence as any).academic;
      delete (evidence as any).academicHistory;
      delete (evidence as any).marks;
    }
    if (!visibility.github_enabled) {
      delete (evidence as any).github;
    }
    if (!visibility.hackerrank_enabled) {
      delete (evidence as any).hackerrank;
    }
    if (!visibility.linkedin_enabled) {
      delete (evidence as any).linkedin;
      delete (evidence as any).posts;
    }
    if (!visibility.leetcode_enabled) {
      delete (evidence as any).leetcode;
    }
    if (!visibility.hackathon_enabled) {
      (evidence as any).hackathons = [];
    }
  }

  res.json(evidence);
});

export default router;


