import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireRole, rateLimit, AuthRequest } from '../auth.js';
import { calculateAcademicHistoryBulk, calculateAcademicHistory } from '../academic-service.js';
import { processAiQuery } from '../ai-assistant.js';

const router = Router();
router.use(requireAuth, requireRole('placement'));

router.post('/ai-query', rateLimit(25, 60000, 'placement-ai'), async (req: AuthRequest, res) => {
  res.json(await processAiQuery(req.user!, String(req.body.query || '')));
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
  };
  res.json(visibility);
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
  };

  const students = (await query(`
    SELECT s.id, s.roll_number, u.full_name, c.name AS "className", c.year AS "classYear", c.section AS "classSection", d.name AS "departmentName", c.id AS "classId",
           s.github_url, s.hackerrank_url, s.leetcode_url, s.linkedin_url, s.portfolio_url, s.resume_url, s.profile_strength AS ai_score,
           s.github_data, s.hackerrank_data, s.leetcode_data,
           (SELECT COUNT(*) FROM projects p WHERE p.student_id = s.id) as projects_count,
           (SELECT COUNT(*) FROM posts pt WHERE pt.student_id = s.id) as posts_count
    FROM students s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN classes c ON c.id = s.class_id
    LEFT JOIN departments d ON d.id = s.department_id
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
      linkedin_url: visibility.linkedin_enabled ? s.linkedin_url : null,
      hackerrank_url: visibility.hackerrank_enabled ? s.hackerrank_url : null,
      hackerrank_data: visibility.hackerrank_enabled ? s.hackerrank_data : null,
      leetcode_url: (visibility.leetcode_enabled ?? true) ? s.leetcode_url : null,
      leetcode_data: (visibility.leetcode_enabled ?? true) ? s.leetcode_data : null,
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
  };

  const s = (await query<any>(
    `SELECT s.*,u.full_name,u.email,c.name AS "className",c.year AS "classYear",c.section AS "classSection",d.name AS "departmentName"
     FROM students s JOIN users u ON u.id=s.user_id
     LEFT JOIN classes c ON c.id=s.class_id
     LEFT JOIN departments d ON d.id=s.department_id
     WHERE s.id=$1`,
    [req.params.studentId],
  )).rows[0];
  if (!s) return res.status(404).json({ error: 'Student record not found.' });

  const [projects, achievements, certifications, hackathons, documents, posts] = await Promise.all(
    ['projects', 'achievements', 'certifications', 'hackathons', 'student_documents'].map(
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

  const academicHistory = visibility.academic_enabled ? await calculateAcademicHistory(s.id) : null;

  res.json({
    ...s,
    visibility,
    projects: projects.rows,
    achievements: achievements.rows,
    certifications: certifications.rows,
    hackathons: visibility.hackathon_enabled ? hackathons.rows : [],
    documents: documents.rows,
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

export default router;
