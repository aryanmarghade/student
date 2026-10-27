import { test, expect } from '@playwright/test';
import pg from 'pg';
import path from 'path';
import dotenv from 'dotenv';
import { execSync } from 'child_process';
import { runMonthlyGitHubSync } from '../server/github-sync.js';
import { runMonthlyLeetCodeSync } from '../server/leetcode-sync.js';
import { runMonthlyHackerRankSync } from '../server/hackerrank-sync.js';
import { runMonthlyLinkedInSync } from '../server/linkedin-sync.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.test'), override: true });

test.describe('Part 0: Demo Analytics Seed & Reset Verification', () => {
  let pool: pg.Pool;

  test.beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    expect(databaseUrl).toBeDefined();
    expect(databaseUrl).toContain('test');
    pool = new pg.Pool({ connectionString: databaseUrl });
  });

  test.afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  test('refuses to run when NODE_ENV=production', () => {
    let errorCaught = false;
    try {
      execSync('npx tsx scripts/seed-demo-analytics.ts', {
        env: { ...process.env, NODE_ENV: 'production' },
        stdio: 'pipe',
      });
    } catch (err: any) {
      errorCaught = true;
      const output = (err.stdout?.toString() || '') + (err.stderr?.toString() || '');
      expect(output.toLowerCase()).toMatch(/production|refusing/);
    }
    expect(errorCaught).toBe(true);
  });

  test('seeds ~150 students with demo_ prefix, correlated metrics, snapshots, and edge cases', async () => {
    // Run npm run seed:demo against test database
    const seedOutput = execSync('npm run seed:demo', {
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: 'pipe',
    }).toString();
    console.log('[Seed Output]:', seedOutput);

    // 1. Check student count ~150
    const countRes = await pool.query<{ count: string }>(
      `SELECT count(*) FROM students WHERE id LIKE 'demo_%'`
    );
    const demoStudentCount = parseInt(countRes.rows[0].count, 10);
    expect(demoStudentCount).toBeGreaterThanOrEqual(140);
    expect(demoStudentCount).toBeLessThanOrEqual(160);

    // 2. All demo rows tagged demo_
    const untaggedRes = await pool.query<{ count: string }>(
      `SELECT count(*) FROM students WHERE roll_number LIKE 'DEMO%' AND id NOT LIKE 'demo_%'`
    );
    expect(parseInt(untaggedRes.rows[0].count, 10)).toBe(0);

    // 3. Spans 4 years and multiple departments
    const yearsRes = await pool.query<{ year: number; count: string }>(
      `SELECT c.year, count(s.id) 
       FROM students s 
       JOIN classes c ON s.class_id = c.id 
       WHERE s.id LIKE 'demo_%' 
       GROUP BY c.year ORDER BY c.year`
    );
    expect(yearsRes.rows.length).toBe(4);
    for (const row of yearsRes.rows) {
      expect(parseInt(row.count, 10)).toBeGreaterThanOrEqual(25);
    }

    const deptsRes = await pool.query<{ count: string }>(
      `SELECT count(DISTINCT department_id) FROM students WHERE id LIKE 'demo_%'`
    );
    expect(parseInt(deptsRes.rows[0].count, 10)).toBeGreaterThanOrEqual(3);

    // 4. Correlated LeetCode data: easy > medium > hard
    const lcRes = await pool.query<{ easy_solved: number; medium_solved: number; hard_solved: number }>(
      `SELECT (leetcode_data->>'easySolved')::int as easy_solved,
              (leetcode_data->>'mediumSolved')::int as medium_solved,
              (leetcode_data->>'hardSolved')::int as hard_solved
       FROM students 
       WHERE id LIKE 'demo_%' 
         AND leetcode_data IS NOT NULL 
         AND (leetcode_data->>'totalSolved')::int > 20`
    );
    expect(lcRes.rows.length).toBeGreaterThan(50);
    for (const row of lcRes.rows) {
      expect(row.easy_solved).toBeGreaterThanOrEqual(row.medium_solved);
      expect(row.medium_solved).toBeGreaterThanOrEqual(row.hard_solved);
    }

    // 5. 6 monthly snapshots for platforms
    const ghSnapRes = await pool.query<{ count: string }>(
      `SELECT count(DISTINCT snapshot_month) FROM student_github_snapshots WHERE id LIKE 'demo_%'`
    );
    expect(parseInt(ghSnapRes.rows[0].count, 10)).toBeGreaterThanOrEqual(6);

    const lcSnapRes = await pool.query<{ count: string }>(
      `SELECT count(DISTINCT snapshot_month) FROM student_leetcode_snapshots WHERE id LIKE 'demo_%'`
    );
    expect(parseInt(lcSnapRes.rows[0].count, 10)).toBeGreaterThanOrEqual(6);

    // 6. Projects, certifications, hackathons, sports, achievements exist
    const [projRes, certRes, hackRes, sportRes, achRes] = await Promise.all([
      pool.query(`SELECT count(*) FROM projects WHERE id LIKE 'demo_%'`),
      pool.query(`SELECT count(*) FROM certifications WHERE id LIKE 'demo_%'`),
      pool.query(`SELECT count(*) FROM hackathons WHERE id LIKE 'demo_%'`),
      pool.query(`SELECT count(*) FROM sports WHERE id LIKE 'demo_%'`),
      pool.query(`SELECT count(*) FROM achievements WHERE id LIKE 'demo_%'`),
    ]);
    expect(parseInt(projRes.rows[0].count, 10)).toBeGreaterThan(50);
    expect(parseInt(certRes.rows[0].count, 10)).toBeGreaterThan(30);
    expect(parseInt(hackRes.rows[0].count, 10)).toBeGreaterThan(30);
    expect(parseInt(sportRes.rows[0].count, 10)).toBeGreaterThan(20);
    expect(parseInt(achRes.rows[0].count, 10)).toBeGreaterThan(30);

    // 7. Edge cases exist:
    // a) No profiles linked
    const noProfileRes = await pool.query(
      `SELECT count(*) FROM students 
       WHERE id LIKE 'demo_%' 
         AND github_url IS NULL 
         AND leetcode_url IS NULL 
         AND hackerrank_url IS NULL 
         AND linkedin_url IS NULL`
    );
    expect(parseInt(noProfileRes.rows[0].count, 10)).toBeGreaterThanOrEqual(3);

    // b) Zero activity
    const zeroActRes = await pool.query(
      `SELECT count(*) FROM students 
       WHERE id LIKE 'demo_%' 
         AND (github_url IS NOT NULL OR leetcode_url IS NOT NULL)
         AND COALESCE((leetcode_data->>'totalSolved')::int, 0) = 0
         AND COALESCE((github_data->>'public_repos')::int, 0) = 0`
    );
    expect(parseInt(zeroActRes.rows[0].count, 10)).toBeGreaterThanOrEqual(2);

    // c) Single platform
    const singlePlatformRes = await pool.query(
      `SELECT count(*) FROM students 
       WHERE id LIKE 'demo_%' 
         AND ((github_url IS NOT NULL AND leetcode_url IS NULL AND hackerrank_url IS NULL)
           OR (leetcode_url IS NOT NULL AND github_url IS NULL AND hackerrank_url IS NULL))`
    );
    expect(parseInt(singlePlatformRes.rows[0].count, 10)).toBeGreaterThanOrEqual(3);

    // d) Top performers (high profile strength or CGPA)
    const topPerformersRes = await pool.query(
      `SELECT count(*) FROM students WHERE id LIKE 'demo_%' AND profile_strength >= 90`
    );
    expect(parseInt(topPerformersRes.rows[0].count, 10)).toBeGreaterThanOrEqual(5);

    // e) At-risk students (backlogs in marks table)
    const atRiskRes = await pool.query(
      `SELECT count(DISTINCT student_id) FROM marks WHERE id LIKE 'demo_%' AND marks_obtained < 40`
    );
    expect(parseInt(atRiskRes.rows[0].count, 10)).toBeGreaterThanOrEqual(5);
  });

  test('sync services SKIP demo rows completely', async () => {
    // Run GitHub, LeetCode, HackerRank, LinkedIn sync functions
    const [gh, lc, hr, li] = await Promise.all([
      runMonthlyGitHubSync(),
      runMonthlyLeetCodeSync(),
      runMonthlyHackerRankSync(),
      runMonthlyLinkedInSync(),
    ]);

    // Ensure none of the processed students are demo students
    const ghDemo = gh.details.filter(d => d.studentId.startsWith('demo_'));
    const lcDemo = lc.details.filter(d => d.studentId.startsWith('demo_'));
    const hrDemo = hr.details.filter(d => d.studentId.startsWith('demo_'));
    const liDemo = li.details.filter(d => d.studentId.startsWith('demo_'));

    expect(ghDemo.length).toBe(0);
    expect(lcDemo.length).toBe(0);
    expect(hrDemo.length).toBe(0);
    expect(liDemo.length).toBe(0);
  });

  test('seed:demo:reset removes ONLY demo rows and leaves real accounts intact', async () => {
    // Count real accounts before reset
    const realUsersBefore = await pool.query<{ count: string }>(
      `SELECT count(*) FROM users WHERE id NOT LIKE 'demo_%'`
    );
    const realUsersCount = parseInt(realUsersBefore.rows[0].count, 10);
    expect(realUsersCount).toBeGreaterThan(0);

    // Run reset script
    const resetOutput = execSync('npm run seed:demo:reset', {
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: 'pipe',
    }).toString();
    console.log('[Reset Output]:', resetOutput);

    // Demo students should be 0
    const demoStudentsAfter = await pool.query<{ count: string }>(
      `SELECT count(*) FROM students WHERE id LIKE 'demo_%'`
    );
    expect(parseInt(demoStudentsAfter.rows[0].count, 10)).toBe(0);

    // Real users should be unchanged
    const realUsersAfter = await pool.query<{ count: string }>(
      `SELECT count(*) FROM users WHERE id NOT LIKE 'demo_%'`
    );
    expect(parseInt(realUsersAfter.rows[0].count, 10)).toBe(realUsersCount);
  });
});
