import crypto from 'crypto';
import pg from 'pg';
import { pool, query } from './db.js';

export interface QaCodingStatsRecord {
  id: string;
  test_run_id: string;
  student_id: string;
  platform: 'leetcode' | 'hackerrank';
  easy_count: number;
  medium_count: number;
  hard_count: number;
  total_problems: number;
  contest_rating: number;
  streak_days: number;
  data_source: 'mock';
  created_at?: string;
}

export interface QaGenerationOptions {
  runId?: string;
  runName?: string;
  studentId?: string;
  poolClient?: pg.PoolClient;
}

export interface QaGenerationSummary {
  runId: string;
  runName: string;
  studentsProcessed: number;
  recordsCreated: number;
  recordsSkipped: number;
  failures: number;
}

/**
 * Deterministic PRNG seeded by studentId and platform.
 * Ensures repeatable, mathematically consistent pseudo-random values.
 */
export function createDeterministicPrng(studentId: string, platform: string, salt: string = 'v1'): () => number {
  const hash = crypto.createHash('sha256').update(`${studentId}:${platform}:${salt}`).digest();
  let seed = hash.readUInt32BE(0);
  return function() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates plausible, mathematically bounded, deterministic coding stats
 * for a specific student and platform.
 */
export function generatePlatformStats(
  studentId: string,
  platform: 'leetcode' | 'hackerrank'
): {
  easy_count: number;
  medium_count: number;
  hard_count: number;
  total_problems: number;
  contest_rating: number;
  streak_days: number;
} {
  const prng = createDeterministicPrng(studentId, platform);

  if (platform === 'leetcode') {
    // LeetCode: realistic distributions where easy >= medium >= hard
    const easy_count = Math.floor(15 + prng() * 205); // 15 to 219
    const mediumRatio = 0.3 + prng() * 0.5; // 30% to 80% of easy
    const medium_count = Math.max(0, Math.floor(easy_count * mediumRatio));
    const hardRatio = 0.05 + prng() * 0.25; // 5% to 30% of medium
    const hard_count = Math.max(0, Math.floor(medium_count * hardRatio));
    const total_problems = easy_count + medium_count + hard_count;

    // Contest rating: 25% chance unrated (0), otherwise 1350 to 2350
    const hasRating = prng() > 0.25;
    const contest_rating = hasRating ? Math.floor(1350 + prng() * 1000) : 0;

    // Streak: 0 to 120 days
    const streak_days = Math.floor(prng() * 120);

    return {
      easy_count,
      medium_count,
      hard_count,
      total_problems,
      contest_rating,
      streak_days,
    };
  } else {
    // HackerRank: problem counts, badges/rating, streaks
    const easy_count = Math.floor(10 + prng() * 170); // 10 to 179
    const mediumRatio = 0.25 + prng() * 0.5;
    const medium_count = Math.max(0, Math.floor(easy_count * mediumRatio));
    const hardRatio = 0.05 + prng() * 0.25;
    const hard_count = Math.max(0, Math.floor(medium_count * hardRatio));
    const total_problems = easy_count + medium_count + hard_count;

    // Contest rating: 30% chance unrated (0), otherwise 1100 to 2100
    const hasRating = prng() > 0.3;
    const contest_rating = hasRating ? Math.floor(1100 + prng() * 1000) : 0;

    // Streak: 0 to 90 days
    const streak_days = Math.floor(prng() * 90);

    return {
      easy_count,
      medium_count,
      hard_count,
      total_problems,
      contest_rating,
      streak_days,
    };
  }
}

/**
 * Generates and stores deterministic mock coding stats in qa.student_coding_stats_test.
 * Fully transactional, parameterized, idempotent, and non-destructive.
 */
export async function generateQaCodingStats(
  options: QaGenerationOptions = {}
): Promise<QaGenerationSummary> {
  const client = options.poolClient || (await pool.connect());
  const shouldRelease = !options.poolClient;

  try {
    await client.query('BEGIN');

    // 1. Resolve or create test run
    const runId = options.runId || crypto.randomUUID();
    const runName = (options.runName || `QA Test Run - ${new Date().toISOString()}`).trim().slice(0, 255);

    await client.query(
      `INSERT INTO qa.coding_stats_test_runs (id, name, created_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO NOTHING`,
      [runId, runName]
    );

    // 2. Query active students using standard institutional joins
    let studentQuery = `
      SELECT s.id, s.roll_number, u.id AS user_id, u.full_name, u.email
      FROM public.students s
      JOIN public.users u ON u.id = s.user_id
      WHERE u.role = 'student' AND u.is_active = TRUE
    `;
    const params: any[] = [];
    if (options.studentId) {
      params.push(options.studentId);
      studentQuery += ` AND s.id = $1`;
    }
    studentQuery += ` ORDER BY s.roll_number ASC`;

    const { rows: activeStudents } = await client.query<{ id: string; roll_number: string }>(studentQuery, params);

    let recordsCreated = 0;
    let recordsSkipped = 0;
    let failures = 0;

    const platforms: ('leetcode' | 'hackerrank')[] = ['leetcode', 'hackerrank'];

    for (const student of activeStudents) {
      for (const platform of platforms) {
        try {
          const stats = generatePlatformStats(student.id, platform);
          const recordId = crypto.randomUUID();

          const insertRes = await client.query(
            `INSERT INTO qa.student_coding_stats_test (
               id, test_run_id, student_id, platform,
               easy_count, medium_count, hard_count, total_problems,
               contest_rating, streak_days, data_source, created_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'mock', CURRENT_TIMESTAMP)
             ON CONFLICT (test_run_id, student_id, platform) DO NOTHING`,
            [
              recordId,
              runId,
              student.id,
              platform,
              stats.easy_count,
              stats.medium_count,
              stats.hard_count,
              stats.total_problems,
              stats.contest_rating,
              stats.streak_days,
            ]
          );

          if ((insertRes.rowCount ?? 0) > 0) {
            recordsCreated++;
          } else {
            recordsSkipped++;
          }
        } catch (err) {
          console.error(`[QA Generator] Error for student ${student.id} on ${platform}:`, err);
          failures++;
        }
      }
    }

    await client.query('COMMIT');

    const summary: QaGenerationSummary = {
      runId,
      runName,
      studentsProcessed: activeStudents.length,
      recordsCreated,
      recordsSkipped,
      failures,
    };

    console.log(
      `[QA Generator] Completed run "${runName}" (${runId}): ${summary.studentsProcessed} students processed, ${summary.recordsCreated} records created, ${summary.recordsSkipped} skipped, ${summary.failures} failures.`
    );

    return summary;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    if (shouldRelease) {
      client.release();
    }
  }
}
