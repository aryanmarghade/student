import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { query, logActivity, id } from '../db.js';
import { requireAuth, requireRole, verifyTeacherClassScope, AuthRequest, rateLimit } from '../auth.js';
import { processAiQuery } from '../ai-assistant.js';
import { linearRegression, median, standardDeviation } from '../analytics.js';
import { currentMonth } from '../github-sync.js';

const router = Router();
router.use(requireAuth, requireRole('teacher'));

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
            s.linkedin_url,s.github_url,s.hackerrank_url,s.profile_photo_url,
            s.profile_strength,s.bio,s.class_id, c.name AS class_name, c.year AS class_year, c.section AS class_section,
            d.name AS department_name
     FROM students s
     JOIN users u ON u.id=s.user_id
     LEFT JOIN classes c ON c.id=s.class_id
     LEFT JOIN departments d ON d.id=s.department_id
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
  const students = (await query(`SELECT s.id,s.roll_number,u.full_name FROM students s JOIN users u ON u.id=s.user_id WHERE s.class_id=$1 ORDER BY s.roll_number`, [classId])).rows;
  const [marks, assessmentDefs] = await Promise.all([
    query<any>(`SELECT * FROM marks WHERE class_id=$1 AND subject_id=$2 ${semester ? 'AND semester_id=$3' : ''}`, semester ? [classId, subjectId, semester] : [classId, subjectId]),
    query<any>(`SELECT id, title, max_marks, assessment_type FROM assessment_definitions WHERE class_id=$1 AND subject_id=$2 AND semester_id=$3 AND status='active' ORDER BY created_at ASC`, [classId, subjectId, semester || ''] ),
  ]);

  const columnDefs = assessmentDefs.rows.length > 0
    ? assessmentDefs.rows.map((a: any) => ({ type: a.title, max: Number(a.max_marks), assessmentType: a.assessment_type, id: a.id }))
    : defaultExams;

  const grid: any = {};
  for (const s of students) {
    grid[s.id] = {};
    for (const exam of columnDefs) {
      const m = marks.rows.find((x: any) => x.student_id === s.id && x.exam_type === exam.type);
      grid[s.id][exam.type] = { marks_obtained: m?.marks_obtained ?? null, max_marks: exam.max, id: m?.id ?? null };
    }
  }
  res.json({ students, examColumns: columnDefs, grid });
});

router.post('/classes/:classId/subjects/:subjectId/assessments', async (req: AuthRequest, res) => {
  const { classId, subjectId } = req.params;
  const { semester_id, title, max_marks, assessment_type = 'Other' } = req.body;

  if (!await verifyTeacherClassScope(classId, subjectId, semester_id, req.user!.id))
    return res.status(403).json({ error: 'Access Denied: You are not assigned to this class and subject.' });

  const safeTitle = String(title || '').trim();
  const safeMaxMarks = Number(max_marks);
  if (!safeTitle) return res.status(400).json({ error: 'Assessment title is required.' });
  if (!Number.isFinite(safeMaxMarks) || safeMaxMarks <= 0) return res.status(400).json({ error: 'Assessment max marks must be a positive number.' });

  const existing = await query<any>(
    `SELECT id FROM assessment_definitions WHERE class_id=$1 AND subject_id=$2 AND semester_id=$3 AND title=$4 AND status='active'`,
    [classId, subjectId, semester_id, safeTitle],
  );
  if (existing.rowCount) return res.status(409).json({ error: 'An active assessment with this title already exists for this class and subject.' });

  const assessment = {
    id: id('asmt'),
    class_id: classId,
    subject_id: subjectId,
    semester_id,
    teacher_user_id: req.user!.id,
    title: safeTitle,
    max_marks: safeMaxMarks,
    assessment_type: ['Internal', 'Mid Sem', 'Final', 'Assignment', 'Practical', 'Other'].includes(assessment_type) ? assessment_type : 'Other',
    status: 'active',
  };

  await query(
    `INSERT INTO assessment_definitions (id,class_id,subject_id,semester_id,teacher_user_id,title,max_marks,assessment_type,status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [assessment.id, assessment.class_id, assessment.subject_id, assessment.semester_id, assessment.teacher_user_id, assessment.title, assessment.max_marks, assessment.assessment_type, assessment.status],
  );

  res.status(201).json({ message: 'Assessment definition created successfully.', assessment });
});

router.post('/classes/:classId/subjects/:subjectId/marks', async (req: AuthRequest, res) => {
  const { classId, subjectId } = req.params;
  const { semester_id, updates } = req.body;
  if (!await verifyTeacherClassScope(classId, subjectId, semester_id, req.user!.id))
    return res.status(403).json({ error: 'Access Denied: You are not authorized to update marks for this class/subject.' });
  if (!Array.isArray(updates) || !updates.length) return res.status(400).json({ error: 'Updates array is required.' });

  const [assessmentDefs] = await Promise.all([
    query<any>('SELECT title, max_marks FROM assessment_definitions WHERE class_id=$1 AND subject_id=$2 AND semester_id=$3 AND status=\'active\' ORDER BY created_at ASC', [classId, subjectId, semester_id || '']),
  ]);

  const lookup = new Map((assessmentDefs.rows || []).map((row: any) => [row.title, Number(row.max_marks)]));
  const errors: string[] = [];
  let saved = 0;
  for (const item of updates) {
    if (item.marks_obtained === null || item.marks_obtained === undefined || item.marks_obtained === '') continue;
    const value = Number(item.marks_obtained);
    const max = Number(item.max_marks) || lookup.get(item.exam_type) || 100;
    if (!Number.isFinite(value) || value < 0 || value > max) { errors.push(`${item.student_id} ${item.exam_type}: invalid mark`); continue; }
    const student = (await query('SELECT 1 FROM students WHERE id=$1 AND class_id=$2', [item.student_id, classId])).rowCount;
    if (!student) { errors.push(`${item.student_id}: student is outside this class`); continue; }
    await query(
      `INSERT INTO marks (id,student_id,class_id,subject_id,semester_id,teacher_user_id,exam_type,marks_obtained,max_marks)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (student_id,class_id,subject_id,semester_id,exam_type)
       DO UPDATE SET marks_obtained=EXCLUDED.marks_obtained,max_marks=EXCLUDED.max_marks,teacher_user_id=EXCLUDED.teacher_user_id`,
      [id('mrk'), item.student_id, classId, subjectId, semester_id || 'sem_1', req.user!.id, item.exam_type, value, max],
    );
    saved++;
  }
  if (saved) await logActivity(req.user!.id, 'MARKS_SAVED', 'MARKS', undefined, `Saved ${saved} mark entries.`);
  if (errors.length && !saved) return res.status(400).json({ error: 'Validation failed on submitted marks', details: errors });
  res.json({ message: `Successfully saved ${saved} mark entries.`, savedCount: saved, validationWarnings: errors });
});

router.post('/classes/:classId/subjects/:subjectId/import-marks', async (req: AuthRequest, res) => {
  const { classId, subjectId } = req.params;
  if (!await verifyTeacherClassScope(classId, subjectId, req.body.semester_id, req.user!.id))
    return res.status(403).json({ error: 'Access Denied: You are not assigned to this class and subject.' });
  const students = (await query<{ id: string; roll_number: string }>('SELECT id,roll_number FROM students WHERE class_id=$1', [classId])).rows;
  const errors: any[] = [], updates: any[] = [];
  for (const [i, item] of (req.body.entries || []).entries()) {
    const s = students.find(x => x.roll_number.toUpperCase() === String(item.roll_number || '').toUpperCase());
    if (!s) { errors.push({ row: i + 1, reason: 'Student not found in assigned class' }); continue; }
    updates.push({ student_id: s.id, exam_type: item.exam_type || 'Internal 1', marks_obtained: item.marks_obtained, max_marks: item.max_marks || 25 });
  }
  let saved = 0;
  for (const u of updates) {
    await query(
      `INSERT INTO marks (id,student_id,class_id,subject_id,semester_id,teacher_user_id,exam_type,marks_obtained,max_marks)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (student_id,class_id,subject_id,semester_id,exam_type)
       DO UPDATE SET marks_obtained=EXCLUDED.marks_obtained,max_marks=EXCLUDED.max_marks`,
      [id('mrk'), u.student_id, classId, subjectId, req.body.semester_id || 'sem_1', req.user!.id, u.exam_type, Number(u.marks_obtained), Number(u.max_marks)],
    );
    saved++;
  }
  res.json({ message: `Batch import completed. Successfully recorded ${saved} marks entries.`, importedCount: saved, errors });
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
  if ((studentIds as string[]).length) { params.push(studentIds); filters.push(`s.id=ANY($${params.length})`); }
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

  // Linear regression on per-student aggregated scores (ordered by student index)
  const regressionPoints = averageByStudent.map((st, i) => ({ x: i + 1, y: st.average }));
  const regression = linearRegression(regressionPoints);

  const visibilityRes = await query<any>(`SELECT * FROM analytics_visibility_settings WHERE id = 'global'`);
  const visibility = visibilityRes.rows[0] || { github_enabled: true, hackathon_enabled: true, linkedin_enabled: true, academic_enabled: true };

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
          points: regression.pointsUsed,
          label: 'Linear Trend Projection (per-student averages)',
        }
      : {
          slope: 0,
          intercept: Number(mean.toFixed(2)),
          rSquared: null,
          predictedNextScore: Number(mean.toFixed(2)),
          points: regressionPoints,
          label: 'Not enough data for regression (need ≥2 students with marks)',
        },
    charts: { gradeDistribution, averageByExamType, averageByStudent },
    externalActivity: {
      totalPosts,
      postsByMonth,
      githubSyncedCount,
      githubTotalRepos,
      githubTotalStars,
      githubTotalContributions,
      githubSnapshotsByMonth,
      githubDataSource,
    },
    rawExportData: rows.map(x => ({
      StudentName: x.full_name,
      RollNumber: x.roll_number,
      ExamType: x.exam_type,
      Semester: x.semester_id,
      MarksObtained: x.marks_obtained,
      MaxMarks: x.max_marks,
      Percentage: (x.marks_obtained / x.max_marks * 100).toFixed(1),
      Grade: (x.marks_obtained / x.max_marks * 100) >= 85 ? 'A' : (x.marks_obtained / x.max_marks * 100) >= 70 ? 'B' : (x.marks_obtained / x.max_marks * 100) >= 55 ? 'C' : (x.marks_obtained / x.max_marks * 100) >= 40 ? 'D' : 'F',
      PassFail: (x.marks_obtained / x.max_marks * 100) >= 40 ? 'Pass' : 'Fail',
    })),
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
     JOIN users u ON u.id = s.user_id
     LEFT JOIN classes c ON c.id = s.class_id
     LEFT JOIN departments d ON d.id = s.department_id
     LEFT JOIN semesters sem ON sem.id = $3
     LEFT JOIN subjects subj ON subj.id = $4
     WHERE s.id = $1 AND s.class_id = $2`,
    [studentId, classId, semesterId, subjectId],
  )).rows[0];

  if (!student) {
    return res.status(404).json({ error: 'Student not found or not enrolled in this class.' });
  }

  // Internal Marks: fetch assessment_definitions for this scope, then matching marks
  const visibilityRes = await query<any>(`SELECT * FROM analytics_visibility_settings WHERE id = 'global'`);
  const visibility = visibilityRes.rows[0] || { github_enabled: true, hackathon_enabled: true, linkedin_enabled: true, academic_enabled: true };

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
    githubData = { synced: false, dataSource: 'hidden', reason: 'Visibility disabled by Admin' };
  }

  // HackerRank
  let hackerrankData = student.hackerrank_url
    ? { url: student.hackerrank_url, synced: false }
    : null;
  if (!visibility.hackathon_enabled) {
    hackerrankData = { url: student.hackerrank_url, synced: false, reason: 'Visibility disabled by Admin' } as any;
  }

  // Posts grouped by month (YYYY-MM)
  const monthMap = new Map<string, number>();
  for (const p of postsRows.rows) {
    const month = new Date(p.created_at).toISOString().slice(0, 7); // YYYY-MM
    monthMap.set(month, (monthMap.get(month) ?? 0) + 1);
  }
  let postsByMonth = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => {
      const [year, m] = month.split('-');
      const date = new Date(Number(year), Number(m) - 1, 1);
      const label = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      return { month, label, count };
    });
  
  if (!visibility.linkedin_enabled) {
    postsByMonth = [];
  }

  if (!visibility.academic_enabled) {
    internalMarks = [];
    internalSummary = null;
  }

  res.json({
    student: {
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
      github_url: student.github_url,
      linkedin_url: student.linkedin_url,
      hackerrank_url: student.hackerrank_url,
      profile_strength: student.profile_strength,
    },
    context: {
      classId,
      subjectId,
      semesterId,
      className: student.className,
      subjectName: student.subjectName,
      subjectCode: student.subjectCode,
      semesterName: student.semesterName,
    },
    internalMarks,
    internalSummary,
    githubData,
    hackerrankData,
    hackerrankUrl: student.hackerrank_url,
    linkedinUrl: student.linkedin_url,
    linkedinPosts: visibility.linkedin_enabled ? postsRows.rows : [],
    recentPosts: visibility.linkedin_enabled ? postsRows.rows.slice(-5).reverse() : [],
    postsByMonth,
    totalPosts: visibility.linkedin_enabled ? postsRows.rows.length : 0,
  });
});

router.get('/students/:studentId/full-profile', async (req: AuthRequest, res) => {
  const s = (await query<any>(
    `SELECT s.*,u.full_name,u.email,c.name AS "className",d.name AS "departmentName"
     FROM students s JOIN users u ON u.id=s.user_id
     LEFT JOIN classes c ON c.id=s.class_id
     LEFT JOIN departments d ON d.id=s.department_id
     WHERE s.id=$1`,
    [req.params.studentId],
  )).rows[0];
  if (!s) return res.status(404).json({ error: 'Student record not found.' });
  if (!await verifyTeacherClassScope(s.class_id, undefined, undefined, req.user!.id))
    return res.status(403).json({ error: 'Access Denied: This student is not enrolled in your assigned classes.' });
  const [projects, achievements, certifications, hackathons, documents, marks, posts] = await Promise.all(
    ['projects', 'achievements', 'certifications', 'hackathons', 'student_documents', 'marks'].map(
      table => query(`SELECT * FROM ${table} WHERE student_id=$1 ORDER BY created_at DESC`, [s.id]),
    ).concat([
      query(`
        SELECT p.*,
               (SELECT json_agg(a.*) FROM post_attachments a WHERE a.post_id = p.id) as attachments
        FROM posts p
        WHERE p.student_id = $1
        ORDER BY p.created_at DESC
      `, [s.id])
    ])
  );
  res.json({
    ...s,
    projects: projects.rows,
    achievements: achievements.rows,
    certifications: certifications.rows,
    hackathons: hackathons.rows,
    documents: documents.rows,
    marks: marks.rows,
    marksheets: [],
    profile_links: {
      github: s.github_url,
      linkedin: s.linkedin_url,
      hackerrank: s.hackerrank_url,
      portfolio: s.portfolio_url,
      resume: s.resume_url,
    },
    posts: posts.rows,
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
router.post('/ai-query', rateLimit(25, 60000, 'teacher-ai'), async (req: AuthRequest, res) => res.json(await processAiQuery(req.user!, String(req.body.query || ''))));

router.post('/students/:studentId/portfolio/:type/:itemId/verify', async (req: AuthRequest, res) => {
  const { studentId, type, itemId } = req.params;
  const { status } = req.body;
  
  const student = (await query<any>('SELECT id,class_id FROM students WHERE id=$1', [studentId])).rows[0];
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  if (!await verifyTeacherClassScope(student.class_id, undefined, undefined, req.user!.id)) {
    return res.status(403).json({ error: 'Access Denied.' });
  }

  const validTables = ['projects', 'achievements', 'certifications', 'hackathons'];
  if (!validTables.includes(type)) return res.status(400).json({ error: 'Invalid portfolio type.' });

  await query(`UPDATE ${type} SET verification_status=$1 WHERE id=$2 AND student_id=$3`, [status, itemId, student.id]);
  res.json({ message: 'Verification status updated successfully' });
});

export default router;
