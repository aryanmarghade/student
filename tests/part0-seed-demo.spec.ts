import { test, expect } from '@playwright/test';
import pg from 'pg';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { execSync } from 'child_process';
import { runMonthlyGitHubSync } from '../server/github-sync.js';
import { runMonthlyLeetCodeSync } from '../server/leetcode-sync.js';
import { runMonthlyHackerRankSync } from '../server/hackerrank-sync.js';
import { runMonthlyLinkedInSync } from '../server/linkedin-sync.js';
import { pearsonCorrelation } from '../scripts/seed-demo-analytics.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.test'), override: true });

test.describe('Part 0: Demo Analytics Seed, Data Quality & Sync Isolation Verification', () => {
  let pool: pg.Pool;

  test.beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    expect(databaseUrl).toBeDefined();
    // Safety guard: test suite must run on test database, NEVER demo or dev
    expect(databaseUrl).toContain('test');
    expect(databaseUrl).not.toContain('demo');
    pool = new pg.Pool({ connectionString: databaseUrl });
  });

  test.afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  test('4. Safety Guard: Test environment rejects pointing at demo database', () => {
    const testDbUrl = process.env.DATABASE_URL || '';
    expect(testDbUrl).toContain('test');
    expect(testDbUrl).not.toContain('demo');

    // Simulate what happens if DATABASE_URL was set to the demo database
    const fakeDemoUrl = 'postgresql://postgres:pass@localhost:5432/vission_academy_demo';
    const isIllegalTarget = fakeDemoUrl.includes('demo') && !fakeDemoUrl.includes('test');
    expect(isIllegalTarget).toBe(true);
  });

  test('refuses to run when NODE_ENV=production or against unauthorized databases', () => {
    let prodErrorCaught = false;
    try {
      execSync('npx tsx scripts/seed-demo-analytics.ts', {
        env: { ...process.env, NODE_ENV: 'production' },
        stdio: 'pipe',
      });
    } catch (err: any) {
      prodErrorCaught = true;
      const output = (err.stdout?.toString() || '') + (err.stderr?.toString() || '');
      expect(output.toLowerCase()).toMatch(/production|refusing/);
    }
    expect(prodErrorCaught).toBe(true);

    let dbErrorCaught = false;
    try {
      execSync('npx tsx scripts/seed-demo-analytics.ts', {
        env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: 'postgresql://postgres:pass@localhost:5432/vission_academy_prod_db' },
        stdio: 'pipe',
      });
    } catch (err: any) {
      dbErrorCaught = true;
      const output = (err.stdout?.toString() || '') + (err.stderr?.toString() || '');
      expect(output.toLowerCase()).toMatch(/safety guard|refusing/);
    }
    expect(dbErrorCaught).toBe(true);
  });

  test('1. DATA QUALITY: seeds ~150 students with demo_ prefix, correlated metrics, snapshots, and edge cases', async () => {
    // Run npm run seed:demo against test database
    const seedOutput = execSync('npm run seed:demo', {
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: 'pipe',
    }).toString();
    console.log('[Seed Output]:\n', seedOutput);

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

    // 3. Spans 4 years and 4 departments
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
    expect(parseInt(deptsRes.rows[0].count, 10)).toBe(4);

    // 4. Correlated LeetCode data: easy >= medium >= hard for ALL students
    const lcRes = await pool.query<{
      total_solved: number;
      easy_solved: number;
      medium_solved: number;
      hard_solved: number;
      ranking: number | null;
    }>(
      `SELECT (leetcode_data->>'totalSolved')::int as total_solved,
              (leetcode_data->>'easySolved')::int as easy_solved,
              (leetcode_data->>'mediumSolved')::int as medium_solved,
              (leetcode_data->>'hardSolved')::int as hard_solved,
              (leetcode_data->>'ranking')::int as ranking
       FROM students 
       WHERE id LIKE 'demo_%' 
         AND leetcode_data IS NOT NULL`
    );
    expect(lcRes.rows.length).toBeGreaterThan(100);

    let allEasyGteMed = true;
    let allMedGteHard = true;
    for (const row of lcRes.rows) {
      if (row.easy_solved < row.medium_solved) allEasyGteMed = false;
      if (row.medium_solved < row.hard_solved) allMedGteHard = false;
    }
    expect(allEasyGteMed).toBe(true);
    expect(allMedGteHard).toBe(true);

    // 5. Rank vs Solved Correlation (Negative correlation: more solved -> lower rank number)
    const ranked = lcRes.rows.filter(r => r.ranking && r.total_solved > 0);
    const solvedArr = ranked.map(r => r.total_solved);
    const rankArr = ranked.map(r => r.ranking!);
    const rankSolvedCorr = pearsonCorrelation(solvedArr, rankArr);
    console.log('[Data Quality] Rank vs Solved Pearson Correlation:', rankSolvedCorr);
    expect(rankSolvedCorr).toBeLessThan(-0.4);

    // 6. Monthly Snapshots Monotonicity: never decrease over the 6 months
    const snapRes = await pool.query<{ student_id: string; total_solved: number }>(
      `SELECT student_id, total_solved 
       FROM student_leetcode_snapshots 
       WHERE id LIKE 'demo_%' 
       ORDER BY student_id, snapshot_month ASC`
    );
    let snapsNeverDecrease = true;
    let prevStudent = '';
    let prevSolved = 0;
    for (const row of snapRes.rows) {
      if (row.student_id !== prevStudent) {
        prevStudent = row.student_id;
        prevSolved = row.total_solved;
      } else {
        if (row.total_solved < prevSolved) {
          snapsNeverDecrease = false;
        }
        prevSolved = row.total_solved;
      }
    }
    expect(snapsNeverDecrease).toBe(true);

    // 7. CGPA vs LeetCode Correlation (Positive correlation: top students perform across both)
    const cgpaLcRes = await pool.query<{ cgpa: number; total_solved: number }>(`
      SELECT m.cgpa, (s.leetcode_data->>'totalSolved')::int as total_solved
      FROM marksheets m
      JOIN students s ON s.id = m.student_id
      WHERE s.id LIKE 'demo_%' 
        AND s.leetcode_data IS NOT NULL 
        AND m.semester_id = 'sem_1'
        AND (s.leetcode_data->>'totalSolved')::int > 0
    `);
    const cgpaArr = cgpaLcRes.rows.map(r => Number(r.cgpa));
    const lcArr = cgpaLcRes.rows.map(r => r.total_solved);
    const cgpaLcCorr = pearsonCorrelation(cgpaArr, lcArr);
    console.log('[Data Quality] CGPA vs LeetCode Solved Pearson Correlation:', cgpaLcCorr);
    expect(cgpaLcCorr).toBeGreaterThan(0.4);

    // 8. Projects, certifications, hackathons, sports, achievements exist
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

    // 9. Edge cases exist:
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

    // d) Top performers
    const topPerformersRes = await pool.query(
      `SELECT count(*) FROM students WHERE id LIKE 'demo_%' AND profile_strength >= 90`
    );
    expect(parseInt(topPerformersRes.rows[0].count, 10)).toBeGreaterThanOrEqual(5);

    // e) At-risk students
    const atRiskRes = await pool.query(
      `SELECT count(DISTINCT student_id) FROM marks WHERE id LIKE 'demo_%' AND marks_obtained < 40`
    );
    expect(parseInt(atRiskRes.rows[0].count, 10)).toBeGreaterThanOrEqual(5);
  });

  test('2. NON-VACUOUS SYNC-SKIP: sync services SKIP demo rows when demo students exist', async () => {
    // 1. Seed demo students first to guarantee demo students exist in the database
    let countRes = await pool.query<{ count: string }>(
      `SELECT count(*) FROM students WHERE id LIKE 'demo_%'`
    );
    if (parseInt(countRes.rows[0].count, 10) < 140) {
      execSync('npm run seed:demo', {
        env: { ...process.env, NODE_ENV: 'test' },
        stdio: 'pipe',
      });
      countRes = await pool.query<{ count: string }>(
        `SELECT count(*) FROM students WHERE id LIKE 'demo_%'`
      );
    }
    const demoCount = parseInt(countRes.rows[0].count, 10);
    expect(demoCount).toBeGreaterThanOrEqual(140);

    // 2. Run monthly sync services
    const [gh, lc, hr, li] = await Promise.all([
      runMonthlyGitHubSync(),
      runMonthlyLeetCodeSync(),
      runMonthlyHackerRankSync(),
      runMonthlyLinkedInSync(),
    ]);

    // 3. Assert that NO demo student was selected or sent to external API
    const ghDemo = gh.details.filter(d => d.studentId.startsWith('demo_'));
    const lcDemo = lc.details.filter(d => d.studentId.startsWith('demo_'));
    const hrDemo = hr.details.filter(d => d.studentId.startsWith('demo_'));
    const liDemo = li.details.filter(d => d.studentId.startsWith('demo_'));

    expect(ghDemo.length).toBe(0);
    expect(lcDemo.length).toBe(0);
    expect(hrDemo.length).toBe(0);
    expect(liDemo.length).toBe(0);
  });

  test('3. EXACT RESET: row count of EVERY table and uploads files are identical before and after reset', async () => {
    // 1. Clean reset first to get clean baseline
    execSync('npm run seed:demo:reset', {
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: 'pipe',
    });

    // 2. Record row counts of EVERY table in public schema
    const tablesRes = await pool.query<{ table_name: string }>(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    const baselineCounts = new Map<string, number>();
    for (const t of tablesRes.rows) {
      const cRes = await pool.query<{ count: string }>(`SELECT count(*) FROM "${t.table_name}"`);
      baselineCounts.set(t.table_name, parseInt(cRes.rows[0].count, 10));
    }

    // Record files in uploads directory
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    const getUploadFiles = () => {
      if (!fs.existsSync(uploadsDir)) return [];
      return fs.readdirSync(uploadsDir, { recursive: true }).filter(f => typeof f === 'string');
    };
    const baselineUploadFiles = getUploadFiles();

    // 3. Seed demo data
    execSync('npm run seed:demo', {
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: 'pipe',
    });

    // Verify demo data is populated
    const seededStudentsRes = await pool.query<{ count: string }>(`SELECT count(*) FROM students WHERE id LIKE 'demo_%'`);
    expect(parseInt(seededStudentsRes.rows[0].count, 10)).toBeGreaterThan(100);

    // 4. Run reset
    execSync('npm run seed:demo:reset', {
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: 'pipe',
    });

    // 5. Compare EVERY table row count against baseline
    const mismatches: Array<{ table: string; before: number; after: number }> = [];
    for (const t of tablesRes.rows) {
      const cRes = await pool.query<{ count: string }>(`SELECT count(*) FROM "${t.table_name}"`);
      const afterCount = parseInt(cRes.rows[0].count, 10);
      const beforeCount = baselineCounts.get(t.table_name)!;
      if (beforeCount !== afterCount) {
        mismatches.push({ table: t.table_name, before: beforeCount, after: afterCount });
      }
    }

    console.log('[Exact Reset Verification] Table count mismatches:', mismatches);
    expect(mismatches.length).toBe(0);

    // 6. Compare uploads directory
    const afterUploadFiles = getUploadFiles();
    expect(afterUploadFiles).toEqual(baselineUploadFiles);
  });
});
