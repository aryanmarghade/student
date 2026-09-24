import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { calculateAcademicHistoryBulk, calculateAcademicHistory } from '../academic-service.js';

const router = Router();
router.use(requireAuth, requireRole('placement'));

router.get('/dashboard', async (req, res) => {
  const students = (await query(`
    SELECT s.id, s.roll_number, u.full_name, c.name AS "className", c.year AS "classYear", c.section AS "classSection", d.name AS "departmentName", c.id AS "classId",
           s.github_url, s.hackerrank_url, s.linkedin_url, s.resume_url, s.profile_strength AS ai_score,
           (SELECT COUNT(*) FROM projects p WHERE p.student_id = s.id) as projects_count,
           (SELECT COUNT(*) FROM posts pt WHERE pt.student_id = s.id) as posts_count
    FROM students s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN classes c ON c.id = s.class_id
    LEFT JOIN departments d ON d.id = s.department_id
    ORDER BY c.year, s.roll_number
  `)).rows;

  const studentIds = students.map(s => s.id);
  const histories = await calculateAcademicHistoryBulk(studentIds);

  const enriched = students.map(s => ({
    ...s,
    academicHistory: histories[s.id]
  }));

  const summary = {
    totalStudents: enriched.length,
    studentsWithCurrentBacklogs: enriched.filter(s => s.academicHistory.currentBacklogsCount > 0).length,
    studentsWithHistoricalBacklogs: enriched.filter(s => s.academicHistory.totalBacklogsCount > 0).length,
    studentsWith0Backlogs: enriched.filter(s => s.academicHistory.totalBacklogsCount === 0).length,
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

    const cgpa = s.academicHistory?.cgpa;
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

  res.json({ summary, yearWiseData, classWiseData, students: enriched });
});

router.get('/students/:studentId/full-profile', async (req, res) => {
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

  const academicHistory = await calculateAcademicHistory(s.id);

  res.json({
    ...s,
    projects: projects.rows,
    achievements: achievements.rows,
    certifications: certifications.rows,
    hackathons: hackathons.rows,
    documents: documents.rows,
    profile_links: {
      github: s.github_url,
      linkedin: s.linkedin_url,
      hackerrank: s.hackerrank_url,
      portfolio: s.portfolio_url,
      resume: s.resume_url,
    },
    posts: posts.rows,
    academicHistory
  });
});

export default router;
