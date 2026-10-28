import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireRole, rateLimit, AuthRequest } from '../auth.js';
import { calculateAcademicHistoryBulk, calculateAcademicHistory } from '../academic-service.js';
import { processAiQuery } from '../ai-assistant.js';
import {
  getStudentComprehensiveEvidence,
  evaluateRoleReadiness,
  evaluateRoleReadinessWithAi
} from '../student-evidence-service.js';
import {
  createJobDescription,
  listJobDescriptions,
  getJobDescriptionById,
  deleteJobDescription,
  matchCandidateToJob,
  matchCohortToJob,
} from '../placement-intelligence-service.js';
import { handlePlacementAiRequest } from '../role-intelligence-engine.js';

const router = Router();
router.use(requireAuth, requireRole('placement'));

router.post('/ai-query', rateLimit(25, 60000, 'placement-ai'), async (req: AuthRequest, res) => {
  const task = req.body.task;
  const queryText = String(req.body.query || '');

  // If specific job & student match requested or explicit placement task, use role-intelligence-engine
  if (req.body.studentId && req.body.jobId) {
    const response = await handlePlacementAiRequest(req.user!, {
      role: 'placement',
      task: task || 'placement_job_match',
      queryText,
      studentId: req.body.studentId,
      jobId: req.body.jobId,
    });
    return res.json(response);
  }

  // Otherwise, route through processAiQuery which builds grounded candidate context with visibility enforcement
  const aiRes = await processAiQuery(req.user!, queryText);
  return res.json(aiRes);
});

router.get('/visibility', async (req: AuthRequest, res) => {
  const result = await query<any>(`SELECT * FROM placement_analytics_visibility WHERE placement_user_id = $1`, [req.user!.id]);
  const visibility = result.rows[0] || {
    github_enabled: true,
    linkedin_enabled: true,
    hackerrank_enabled: true,
    leetcode_enabled: true,
    hackathon_enabled: true,
    academic_enabled: true,
    sports_enabled: true,
  };
  res.json(visibility);
});

router.put('/visibility', async (_req: AuthRequest, res) => {
  return res.status(403).json({
    error: 'Access forbidden: Analytics visibility settings can only be configured by an institutional administrator.',
  });
});

router.get('/dashboard', async (req: AuthRequest, res) => {
  const visibilityRes = await query<any>(`SELECT * FROM placement_analytics_visibility WHERE placement_user_id = $1`, [req.user!.id]);
  const visibility = visibilityRes.rows[0] || {
    github_enabled: true,
    linkedin_enabled: true,
    hackerrank_enabled: true,
    leetcode_enabled: true,
    hackathon_enabled: true,
    academic_enabled: true,
    sports_enabled: true,
  };

  const students = (await query(`
    SELECT s.id, s.roll_number, u.full_name, c.name AS "className", c.year AS "classYear", c.section AS "classSection", d.name AS "departmentName", c.id AS "classId",
           s.github_url, s.hackerrank_url, s.leetcode_url, s.linkedin_url, s.portfolio_url, s.resume_url, s.profile_strength AS ai_score,
           s.github_data, s.hackerrank_data, s.leetcode_data,
           s.github_synced_at, s.hackerrank_synced_at, s.leetcode_synced_at,
           (SELECT COUNT(*) FROM projects p WHERE p.student_id = s.id) as projects_count,
           (SELECT COUNT(*) FROM posts pt WHERE pt.student_id = s.id) as posts_count
    FROM students s
    LEFT JOIN users u ON u.id = s.user_id
    LEFT JOIN classes c ON c.id = s.class_id
    LEFT JOIN departments d ON d.id = COALESCE(s.department_id, c.department_id)
    ORDER BY c.year, s.roll_number
  `)).rows;

  const studentIds = students.map(s => s.id);
  const histories = visibility.academic_enabled ? await calculateAcademicHistoryBulk(studentIds) : {};

  const enriched = students.map(s => {
    const hist = histories[s.id] || { currentBacklogsCount: 0, totalBacklogsCount: 0, totalActiveBacklogs: 0, cgpa: null };
    return {
      ...s,
      academicHistory: visibility.academic_enabled ? hist : null,
      cgpa: visibility.academic_enabled ? hist.cgpa : null,
      github_url: visibility.github_enabled ? s.github_url : null,
      github_data: visibility.github_enabled ? s.github_data : null,
      github_synced_at: visibility.github_enabled ? s.github_synced_at : null,
      linkedin_url: visibility.linkedin_enabled ? s.linkedin_url : null,
      hackerrank_url: visibility.hackerrank_enabled ? s.hackerrank_url : null,
      hackerrank_data: visibility.hackerrank_enabled ? s.hackerrank_data : null,
      hackerrank_synced_at: visibility.hackerrank_enabled ? s.hackerrank_synced_at : null,
      leetcode_url: (visibility.leetcode_enabled ?? true) ? s.leetcode_url : null,
      leetcode_data: (visibility.leetcode_enabled ?? true) ? s.leetcode_data : null,
      leetcode_synced_at: (visibility.leetcode_enabled ?? true) ? s.leetcode_synced_at : null,
    };
  });

  const summary = {
    totalStudents: enriched.length,
    studentsWithCurrentBacklogs: visibility.academic_enabled ? enriched.filter(s => (s.academicHistory?.currentBacklogsCount || 0) > 0).length : 0,
    studentsWithHistoricalBacklogs: visibility.academic_enabled ? enriched.filter(s => (s.academicHistory?.totalBacklogsCount || 0) > 0).length : 0,
    studentsWith0Backlogs: visibility.academic_enabled ? enriched.filter(s => (s.academicHistory?.totalBacklogsCount || 0) === 0).length : enriched.length,
  };

  const yearStats: Record<string, { total: number, cgpaSum: number, cgpaCount: number }> = {};
  const classStats: Record<string, Record<string, { total: number, cgpaSum: number, cgpaCount: number }>> = {};

  enriched.forEach(s => {
    const year = s.classYear || 'Unknown';
    const className = s.className || 'Unknown';
    
    if (!yearStats[year]) yearStats[year] = { total: 0, cgpaSum: 0, cgpaCount: 0 };
    yearStats[year].total++;
    
    if (!classStats[year]) classStats[year] = {};
    if (!classStats[year][className]) classStats[year][className] = { total: 0, cgpaSum: 0, cgpaCount: 0 };
    classStats[year][className].total++;

    const cgpa = s.academicHistory?.currentCgpa ?? s.academicHistory?.cgpa;
    if (cgpa != null) {
      yearStats[year].cgpaSum += cgpa;
      yearStats[year].cgpaCount++;
      classStats[year][className].cgpaSum += cgpa;
      classStats[year][className].cgpaCount++;
    }
  });

  const yearWiseData = Object.keys(yearStats).map(year => ({
    year,
    total: yearStats[year].total,
    avgCgpa: yearStats[year].cgpaCount > 0 ? (yearStats[year].cgpaSum / yearStats[year].cgpaCount) : 0
  })).sort((a, b) => String(a.year).localeCompare(String(b.year)));

  const classWiseData = Object.keys(classStats).map(year => ({
    year,
    classes: Object.keys(classStats[year]).map(c => ({
      className: c,
      total: classStats[year][c].total,
      avgCgpa: classStats[year][c].cgpaCount > 0 ? (classStats[year][c].cgpaSum / classStats[year][c].cgpaCount) : 0
    }))
  }));

  res.json({ visibility, summary, yearWiseData, classWiseData, students: enriched });
});

router.get('/students/:studentId/full-profile', async (req: AuthRequest, res) => {
  const visibilityRes = await query<any>(`SELECT * FROM placement_analytics_visibility WHERE placement_user_id = $1`, [req.user!.id]);
  const visibility = visibilityRes.rows[0] || {
    github_enabled: true,
    linkedin_enabled: true,
    hackerrank_enabled: true,
    leetcode_enabled: true,
    hackathon_enabled: true,
    academic_enabled: true,
    sports_enabled: true,
  };

  const s = (await query<any>(
    `SELECT s.*,u.full_name,u.email,c.name AS "className",c.year AS "classYear",c.section AS "classSection",d.name AS "departmentName"
     FROM students s LEFT JOIN users u ON u.id=s.user_id
     LEFT JOIN classes c ON c.id=s.class_id
     LEFT JOIN departments d ON d.id=COALESCE(s.department_id, c.department_id)
     WHERE s.id=$1`,
    [req.params.studentId],
  )).rows[0];
  if (!s) return res.status(404).json({ error: 'Student record not found.' });

  const [projects, achievements, certifications, hackathons, documents, posts, sports, hrEvidence, liPosts] = await Promise.all([
    query(`SELECT * FROM projects WHERE student_id=$1 ORDER BY created_at DESC`, [s.id]),
    query(`SELECT * FROM achievements WHERE student_id=$1 ORDER BY created_at DESC`, [s.id]),
    query(`SELECT * FROM certifications WHERE student_id=$1 ORDER BY created_at DESC`, [s.id]),
    query(`SELECT * FROM hackathons WHERE student_id=$1 ORDER BY created_at DESC`, [s.id]),
    query(`SELECT * FROM student_documents WHERE student_id=$1 ORDER BY created_at DESC`, [s.id]),
    query(`
      SELECT p.*,
             (SELECT json_agg(a.*) FROM post_attachments a WHERE a.post_id = p.id) as attachments
      FROM posts p
      WHERE p.student_id = $1
      ORDER BY p.created_at DESC
    `, [s.id]),
    query(`SELECT * FROM sports WHERE student_id=$1 ORDER BY created_at DESC`, [s.id]),
    query(`SELECT * FROM student_hackerrank_evidence WHERE student_id=$1 ORDER BY created_at DESC`, [s.id]),
    query(`SELECT * FROM student_linkedin_posts WHERE student_id=$1 ORDER BY post_date DESC NULLS LAST, created_at DESC`, [s.id]),
  ]);

  const academicHistory = visibility.academic_enabled ? await calculateAcademicHistory(s.id) : null;

  res.json({
    ...s,
    visibility,
    projects: projects.rows,
    achievements: achievements.rows,
    certifications: certifications.rows,
    hackathons: visibility.hackathon_enabled ? hackathons.rows : [],
    documents: documents.rows,
    sports: visibility.sports_enabled ? sports.rows : [],
    hackerrank_evidence: visibility.hackerrank_enabled ? hrEvidence.rows : [],
    linkedin_posts: visibility.linkedin_enabled ? liPosts.rows : [],
    profile_links: {
      github: visibility.github_enabled ? s.github_url : null,
      linkedin: visibility.linkedin_enabled ? s.linkedin_url : null,
      hackerrank: visibility.hackerrank_enabled ? s.hackerrank_url : null,
      leetcode: (visibility.leetcode_enabled ?? true) ? s.leetcode_url : null,
      portfolio: s.portfolio_url,
      resume: s.resume_url,
    },
    github_url: visibility.github_enabled ? s.github_url : null,
    github_data: visibility.github_enabled ? s.github_data : null,
    linkedin_url: visibility.linkedin_enabled ? s.linkedin_url : null,
    hackerrank_url: visibility.hackerrank_enabled ? s.hackerrank_url : null,
    hackerrank_data: visibility.hackerrank_enabled ? s.hackerrank_data : null,
    leetcode_url: (visibility.leetcode_enabled ?? true) ? s.leetcode_url : null,
    leetcode_data: (visibility.leetcode_enabled ?? true) ? s.leetcode_data : null,
    posts: posts.rows,
    academicHistory
  });
});

router.get('/students/:studentId/intelligence-evidence', async (req: AuthRequest, res) => {
  try {
    const evidence = await getStudentComprehensiveEvidence(req.params.studentId);
    res.json({
      evidencePackage: evidence,
      skillAssessments: evidence.domainAssessments,
    });
  } catch (err: any) {
    console.error('[Placement Intelligence Evidence Error]', err);
    res.status(500).json({ error: 'Failed to assemble student intelligence evidence.' });
  }
});

router.post('/ai/role-match', rateLimit(25, 60000, 'placement-role-match'), async (req: AuthRequest, res) => {
  const { studentId, roleName } = req.body;
  if (!studentId || !roleName) {
    return res.status(400).json({ error: 'studentId and roleName are required.' });
  }

  try {
    const evidence = await getStudentComprehensiveEvidence(String(studentId));
    if (!evidence) {
      return res.status(404).json({ error: 'Student record not found.' });
    }
    const evaluation = await evaluateRoleReadinessWithAi(
      evidence,
      String(roleName)
    );
    res.json(evaluation);
  } catch (err: any) {
    console.error('[Placement Role Match Error]', err);
    res.status(500).json({ error: 'Failed to compute role readiness.' });
  }
});

// ── Job Description & Requirement Matrix Endpoints ─────────────────────────

router.get('/job-descriptions', async (_req: AuthRequest, res) => {
  try {
    const list = await listJobDescriptions();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list job descriptions.' });
  }
});

router.post('/job-descriptions', async (req: AuthRequest, res) => {
  try {
    const title = req.body.title || req.body.roleTitle;
    const company = req.body.company || req.body.companyName || 'Campus Recruitment Partner';
    const desc = req.body.descriptionText || req.body.description;
    const { minCgpa, maxBacklogs, requiredSkills, eligibleBranches } = req.body;
    if (!title || !desc) {
      return res.status(400).json({ error: 'Job title and description text are required.' });
    }
    const created = await createJobDescription({
      title,
      company,
      description: desc,
      minCgpa: minCgpa !== undefined ? Number(minCgpa) : undefined,
      maxBacklogs: maxBacklogs !== undefined ? Number(maxBacklogs) : undefined,
      requiredSkills,
      eligibleBranches,
      createdBy: req.user!.id,
    });
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create job description.' });
  }
});

router.get('/job-descriptions/:id', async (req: AuthRequest, res) => {
  try {
    const jd = await getJobDescriptionById(req.params.id);
    if (!jd) return res.status(404).json({ error: 'Job description not found.' });
    res.json(jd);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve job description.' });
  }
});

router.delete('/job-descriptions/:id', async (req: AuthRequest, res) => {
  try {
    const ok = await deleteJobDescription(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Job description not found.' });
    res.json({ message: 'Job description removed successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete job description.' });
  }
});

router.post('/job-descriptions/:id/match-candidate', async (req: AuthRequest, res) => {
  try {
    const { studentId } = req.body;
    if (!studentId) return res.status(400).json({ error: 'studentId is required.' });
    const match = await matchCandidateToJob(studentId, req.params.id);
    res.json(match);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to match candidate against job description.' });
  }
});

router.post('/job-descriptions/:id/cohort-match', async (req: AuthRequest, res) => {
  try {
    const { classId } = req.body;
    const cohortResults = await matchCohortToJob(req.params.id, classId);
    res.json(cohortResults);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to match cohort against job description.' });
  }
});

export default router;
