import { Router, Request, Response } from 'express';
import { query, logActivity } from '../db.js';
import { AuthRequest } from '../auth.js';
import { generateQaCodingStats } from '../qa-coding-stats-generator.js';

const router = Router();

// Strict UUID regex for validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Environment & Authorization safety guard.
 * Disables QA generation and deletion in production by default.
 * Requires ENABLE_QA_CODING_DATA=true in all environments.
 */
function checkQaEnvironmentAllowed(_req: Request, res: Response, next: () => void) {
  // 1. Absolute production block: strictly prohibited in production, regardless of flags
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      error: 'QA test data operations are strictly prohibited in the production environment.',
    });
  }

  // 2. Outside production: requires explicit ENABLE_QA_CODING_DATA=true flag
  if (process.env.ENABLE_QA_CODING_DATA !== 'true') {
    return res.status(403).json({
      error: 'QA test data management is disabled. Set ENABLE_QA_CODING_DATA=true in environment configuration.',
    });
  }

  next();
}

// Protect all QA endpoints (read, generate, delete) by default behind environment guard
router.use(checkQaEnvironmentAllowed);

/**
 * POST /api/admin/qa/coding-stats/generate
 * Generates isolated mock statistics for LeetCode and HackerRank across all active students.
 */
router.post('/generate', async (req: AuthRequest, res: Response) => {
  try {
    const { runName, studentId, runId } = req.body || {};

    if (runId !== undefined && (typeof runId !== 'string' || !UUID_REGEX.test(runId))) {
      return res.status(400).json({ error: 'If provided, runId must be a valid UUID string.' });
    }

    if (studentId !== undefined && (typeof studentId !== 'string' || studentId.trim().length === 0 || studentId.length > 64)) {
      return res.status(400).json({ error: 'If provided, studentId must be a valid string identifier (max 64 chars).' });
    }

    if (runName !== undefined && (typeof runName !== 'string' || runName.trim().length === 0 || runName.length > 255)) {
      return res.status(400).json({ error: 'If provided, runName must be a non-empty string up to 255 characters.' });
    }

    const summary = await generateQaCodingStats({
      runName: runName ? String(runName).trim() : undefined,
      studentId: studentId ? String(studentId).trim() : undefined,
      runId: runId ? String(runId).trim() : undefined,
    });

    await logActivity(
      req.user?.id,
      'GENERATE_QA_CODING_STATS',
      'qa.coding_stats_test_runs',
      summary.runId,
      JSON.stringify({
        runName: summary.runName,
        studentsProcessed: summary.studentsProcessed,
        recordsCreated: summary.recordsCreated,
      })
    );

    return res.status(201).json({
      success: true,
      message: 'QA coding test stats generated successfully in isolated qa schema.',
      run: {
        id: summary.runId,
        name: summary.runName,
      },
      summary,
    });
  } catch (error: any) {
    console.error('[QA API] Error generating coding stats:', error);
    return res.status(500).json({
      error: 'Failed to generate QA coding test stats. Operation rolled back.',
    });
  }
});

/**
 * GET /api/admin/qa/coding-stats/runs
 * Lists all available test runs with summary counts and timestamps.
 */
router.get('/runs', async (_req: AuthRequest, res: Response) => {
  try {
    const runsRes = await query(`
      SELECT
        r.id,
        r.name,
        r.created_at,
        COUNT(s.id)::int AS total_records,
        COUNT(DISTINCT s.student_id)::int AS total_students,
        COUNT(s.id) FILTER (WHERE s.platform = 'leetcode')::int AS leetcode_records,
        COUNT(s.id) FILTER (WHERE s.platform = 'hackerrank')::int AS hackerrank_records,
        COALESCE(ROUND(AVG(s.total_problems), 1), 0)::float AS avg_problems_solved
      FROM qa.coding_stats_test_runs r
      LEFT JOIN qa.student_coding_stats_test s ON s.test_run_id = r.id
      GROUP BY r.id, r.name, r.created_at
      ORDER BY r.created_at DESC
    `);

    return res.json({
      runs: runsRes.rows,
    });
  } catch (error: any) {
    console.error('[QA API] Error fetching test runs:', error);
    return res.status(500).json({ error: 'Failed to retrieve QA test runs.' });
  }
});

/**
 * GET /api/admin/qa/coding-stats?runId=<uuid>
 * Returns mock records for a selected QA run with student metadata.
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const runId = req.query.runId;

    if (!runId || typeof runId !== 'string' || !UUID_REGEX.test(runId)) {
      return res.status(400).json({
        error: 'Valid UUID runId query parameter is required (e.g. ?runId=00000000-0000-0000-0000-000000000000).',
      });
    }

    const runRes = await query(
      `SELECT id, name, created_at FROM qa.coding_stats_test_runs WHERE id = $1`,
      [runId]
    );

    if (runRes.rows.length === 0) {
      return res.status(404).json({ error: `QA test run not found with ID ${runId}.` });
    }

    const run = runRes.rows[0];

    const statsRes = await query(`
      SELECT
        t.id,
        t.test_run_id,
        t.student_id,
        t.platform,
        t.easy_count,
        t.medium_count,
        t.hard_count,
        t.total_problems,
        t.contest_rating,
        t.streak_days,
        t.data_source,
        t.created_at,
        s.roll_number,
        u.full_name AS student_name,
        u.email AS student_email,
        c.name AS class_name,
        d.name AS department_name
      FROM qa.student_coding_stats_test t
      JOIN public.students s ON s.id = t.student_id
      JOIN public.users u ON u.id = s.user_id
      LEFT JOIN public.classes c ON c.id = s.class_id
      LEFT JOIN public.departments d ON d.id = s.department_id
      WHERE t.test_run_id = $1
      ORDER BY s.roll_number ASC, t.platform ASC
    `, [runId]);

    const stats = statsRes.rows;
    const leetcodeRecords = stats.filter((r: any) => r.platform === 'leetcode');
    const hackerrankRecords = stats.filter((r: any) => r.platform === 'hackerrank');

    const summary = {
      totalRecords: stats.length,
      totalStudents: new Set(stats.map((r: any) => r.student_id)).size,
      leetcodeCount: leetcodeRecords.length,
      hackerrankCount: hackerrankRecords.length,
      avgLeetcodeSolved: leetcodeRecords.length
        ? Math.round(leetcodeRecords.reduce((acc: number, r: any) => acc + r.total_problems, 0) / leetcodeRecords.length)
        : 0,
      avgHackerrankSolved: hackerrankRecords.length
        ? Math.round(hackerrankRecords.reduce((acc: number, r: any) => acc + r.total_problems, 0) / hackerrankRecords.length)
        : 0,
      avgContestRating: stats.length
        ? Math.round(stats.reduce((acc: number, r: any) => acc + r.contest_rating, 0) / stats.length)
        : 0,
    };

    return res.json({
      run,
      stats,
      summary,
      isTestData: true,
      label: 'TEST DATA — NOT VERIFIED',
    });
  } catch (error: any) {
    console.error('[QA API] Error querying coding stats for run:', error);
    return res.status(500).json({ error: 'Failed to retrieve QA coding test records.' });
  }
});

/**
 * DELETE /api/admin/qa/coding-stats/runs/:runId
 * Deletes a selected QA test run and cascades only to its isolated mock stats.
 */
router.delete('/runs/:runId', async (req: AuthRequest, res: Response) => {
  try {
    const { runId } = req.params;

    if (!runId || !UUID_REGEX.test(runId)) {
      return res.status(400).json({ error: 'Valid UUID runId parameter is required.' });
    }

    const deleteRes = await query(
      `DELETE FROM qa.coding_stats_test_runs WHERE id = $1 RETURNING id, name`,
      [runId]
    );

    if (deleteRes.rows.length === 0) {
      return res.status(404).json({ error: `QA test run not found with ID ${runId}.` });
    }

    const deletedRun = deleteRes.rows[0];

    await logActivity(
      req.user?.id,
      'DELETE_QA_CODING_STATS_RUN',
      'qa.coding_stats_test_runs',
      runId,
      `Deleted QA test run "${deletedRun.name}" and all associated mock records.`
    );

    return res.json({
      success: true,
      message: `QA test run "${deletedRun.name}" deleted successfully.`,
      deletedRunId: runId,
    });
  } catch (error: any) {
    console.error('[QA API] Error deleting test run:', error);
    return res.status(500).json({ error: 'Failed to delete QA test run.' });
  }
});

export { checkQaEnvironmentAllowed };
export default router;
