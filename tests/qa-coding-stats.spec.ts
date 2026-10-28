import { test, expect } from '@playwright/test';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { Pool } from 'pg';
import crypto from 'crypto';
import {
  generatePlatformStats,
  createDeterministicPrng,
  generateQaCodingStats,
} from '../server/qa-coding-stats-generator.js';
import { checkQaEnvironmentAllowed } from '../server/routes/admin-qa-routes.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });

const BASE_URL = 'http://127.0.0.1:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_vission_academy_key_2026';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

let adminToken: string;
let teacherToken: string;
let placementToken: string;
let studentToken: string;

let baselineStudentCount: number;
let baselineMarksCount: number;
let baselineMarksheetsCount: number;
let baselineLeetcodeSnapshotsCount: number;
let baselineHackerrankSnapshotsCount: number;
let baselineHackerrankEvidenceCount: number;

test.beforeAll(async () => {
  // Query users from test database
  const [adminRes, teacherRes, placementRes, studentRes] = await Promise.all([
    pool.query(`SELECT id, email, role, full_name FROM users WHERE role='admin' LIMIT 1`),
    pool.query(`SELECT id, email, role, full_name FROM users WHERE role='teacher' LIMIT 1`),
    pool.query(`SELECT id, email, role, full_name FROM users WHERE role='placement' LIMIT 1`),
    pool.query(`SELECT id, email, role, full_name FROM users WHERE role='student' LIMIT 1`),
  ]);

  const admin = adminRes.rows[0];
  const teacher = teacherRes.rows[0];
  const placement = placementRes.rows[0];
  const student = studentRes.rows[0];

  adminToken = jwt.sign(
    { id: admin.id, email: admin.email, role: admin.role, full_name: admin.full_name },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  teacherToken = jwt.sign(
    { id: teacher.id, email: teacher.email, role: teacher.role, full_name: teacher.full_name },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  placementToken = jwt.sign(
    { id: placement.id, email: placement.email, role: placement.role, full_name: placement.full_name },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  studentToken = jwt.sign(
    { id: student.id, email: student.email, role: student.role, full_name: student.full_name },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Record baseline counts in production/live tables
  const [sRes, mRes, msRes, lcRes, hrRes, heRes] = await Promise.all([
    pool.query('SELECT count(*)::int AS count FROM students'),
    pool.query('SELECT count(*)::int AS count FROM marks'),
    pool.query('SELECT count(*)::int AS count FROM marksheets'),
    pool.query('SELECT count(*)::int AS count FROM student_leetcode_snapshots'),
    pool.query('SELECT count(*)::int AS count FROM student_hackerrank_snapshots'),
    pool.query('SELECT count(*)::int AS count FROM student_hackerrank_evidence'),
  ]);

  baselineStudentCount = sRes.rows[0].count;
  baselineMarksCount = mRes.rows[0].count;
  baselineMarksheetsCount = msRes.rows[0].count;
  baselineLeetcodeSnapshotsCount = lcRes.rows[0].count;
  baselineHackerrankSnapshotsCount = hrRes.rows[0].count;
  baselineHackerrankEvidenceCount = heRes.rows[0].count;
});

test.afterAll(async () => {
  await pool.end();
});

test.describe('1. Unit Tests: Deterministic Mock Data Generator', () => {
  test('generator is strictly deterministic for identical student and platform', () => {
    const studentA = 'std_test_001';
    const stats1 = generatePlatformStats(studentA, 'leetcode');
    const stats2 = generatePlatformStats(studentA, 'leetcode');
    expect(stats1).toEqual(stats2);

    const hrStats1 = generatePlatformStats(studentA, 'hackerrank');
    const hrStats2 = generatePlatformStats(studentA, 'hackerrank');
    expect(hrStats1).toEqual(hrStats2);
  });

  test('different students yield varied deterministic values', () => {
    const statsA = generatePlatformStats('std_student_alpha', 'leetcode');
    const statsB = generatePlatformStats('std_student_beta', 'leetcode');
    // Highly unlikely to match across all dimensions
    const isExactMatch =
      statsA.easy_count === statsB.easy_count &&
      statsA.medium_count === statsB.medium_count &&
      statsA.hard_count === statsB.hard_count &&
      statsA.contest_rating === statsB.contest_rating;
    expect(isExactMatch).toBe(false);
  });

  test('problem counts and ratings satisfy non-negative bounds and mathematical consistency', () => {
    const testIds = ['student_1', 'student_2', 'student_3', 'student_100', 'student_xyz'];
    for (const sid of testIds) {
      for (const platform of ['leetcode', 'hackerrank'] as const) {
        const stats = generatePlatformStats(sid, platform);
        expect(stats.easy_count).toBeGreaterThanOrEqual(0);
        expect(stats.medium_count).toBeGreaterThanOrEqual(0);
        expect(stats.hard_count).toBeGreaterThanOrEqual(0);
        expect(stats.contest_rating).toBeGreaterThanOrEqual(0);
        expect(stats.streak_days).toBeGreaterThanOrEqual(0);
        expect(stats.total_problems).toBe(stats.easy_count + stats.medium_count + stats.hard_count);

        if (platform === 'leetcode') {
          expect(stats.easy_count).toBeGreaterThanOrEqual(stats.medium_count);
          expect(stats.medium_count).toBeGreaterThanOrEqual(stats.hard_count);
        }
      }
    }
  });
});

test.describe('2. Database Tests: Schema, Constraints & Isolation', () => {
  test('qa schema tables and indexes exist in database', async () => {
    const tableRes = await pool.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema = 'qa'
    `);
    const tables = tableRes.rows.map((r: any) => r.table_name);
    expect(tables).toContain('coding_stats_test_runs');
    expect(tables).toContain('student_coding_stats_test');
  });

  test('enforces data_source = mock constraint', async () => {
    const runId = crypto.randomUUID();
    await pool.query(`INSERT INTO qa.coding_stats_test_runs (id, name) VALUES ($1, 'Constraint Test')`, [runId]);
    const studentRes = await pool.query(`SELECT id FROM students LIMIT 1`);
    const studentId = studentRes.rows[0].id;

    // Attempt insert with illegal data_source 'live'
    let threw = false;
    try {
      await pool.query(
        `INSERT INTO qa.student_coding_stats_test (
          id, test_run_id, student_id, platform, easy_count, medium_count, hard_count, total_problems, data_source
        ) VALUES ($1, $2, $3, 'leetcode', 10, 5, 1, 16, 'live')`,
        [crypto.randomUUID(), runId, studentId]
      );
    } catch (err: any) {
      threw = true;
      expect(err.message).toMatch(/violates check constraint/i);
    }
    expect(threw).toBe(true);

    // Clean up test run
    await pool.query(`DELETE FROM qa.coding_stats_test_runs WHERE id = $1`, [runId]);
  });

  test('enforces non-negative problem counts check constraint', async () => {
    const runId = crypto.randomUUID();
    await pool.query(`INSERT INTO qa.coding_stats_test_runs (id, name) VALUES ($1, 'Constraint Test')`, [runId]);
    const studentRes = await pool.query(`SELECT id FROM students LIMIT 1`);
    const studentId = studentRes.rows[0].id;

    let threw = false;
    try {
      await pool.query(
        `INSERT INTO qa.student_coding_stats_test (
          id, test_run_id, student_id, platform, easy_count, medium_count, hard_count, total_problems, data_source
        ) VALUES ($1, $2, $3, 'leetcode', -10, 5, 1, 16, 'mock')`,
        [crypto.randomUUID(), runId, studentId]
      );
    } catch (err: any) {
      threw = true;
      expect(err.message).toMatch(/violates check constraint/i);
    }
    expect(threw).toBe(true);

    await pool.query(`DELETE FROM qa.coding_stats_test_runs WHERE id = $1`, [runId]);
  });

  test('enforces unique constraint on (test_run_id, student_id, platform)', async () => {
    const runId = crypto.randomUUID();
    await pool.query(`INSERT INTO qa.coding_stats_test_runs (id, name) VALUES ($1, 'Uniqueness Test')`, [runId]);
    const studentRes = await pool.query(`SELECT id FROM students LIMIT 1`);
    const studentId = studentRes.rows[0].id;

    await pool.query(
      `INSERT INTO qa.student_coding_stats_test (
        id, test_run_id, student_id, platform, easy_count, medium_count, hard_count, total_problems, data_source
      ) VALUES ($1, $2, $3, 'leetcode', 10, 5, 1, 16, 'mock')`,
      [crypto.randomUUID(), runId, studentId]
    );

    let threw = false;
    try {
      await pool.query(
        `INSERT INTO qa.student_coding_stats_test (
          id, test_run_id, student_id, platform, easy_count, medium_count, hard_count, total_problems, data_source
        ) VALUES ($1, $2, $3, 'leetcode', 20, 10, 2, 32, 'mock')`,
        [crypto.randomUUID(), runId, studentId]
      );
    } catch (err: any) {
      threw = true;
      expect(err.message).toMatch(/violates unique constraint/i);
    }
    expect(threw).toBe(true);

    await pool.query(`DELETE FROM qa.coding_stats_test_runs WHERE id = $1`, [runId]);
  });
});

test.describe('3. API Authorization & RBAC Tests', () => {
  test('rejects unauthenticated requests with 401', async ({ request }) => {
    const resPost = await request.post(`${BASE_URL}/api/admin/qa/coding-stats/generate`, {
      data: { runName: 'Unauth Run' },
    });
    expect(resPost.status()).toBe(401);

    const resGetRuns = await request.get(`${BASE_URL}/api/admin/qa/coding-stats/runs`);
    expect(resGetRuns.status()).toBe(401);

    const resDelete = await request.delete(`${BASE_URL}/api/admin/qa/coding-stats/runs/${crypto.randomUUID()}`);
    expect(resDelete.status()).toBe(401);
  });

  test('rejects student role with 403', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/admin/qa/coding-stats/generate`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: { runName: 'Student Attempt' },
    });
    expect(res.status()).toBe(403);
  });

  test('rejects teacher role with 403', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/admin/qa/coding-stats/generate`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { runName: 'Teacher Attempt' },
    });
    expect(res.status()).toBe(403);
  });

  test('rejects placement officer role with 403', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/admin/qa/coding-stats/generate`, {
      headers: { Authorization: `Bearer ${placementToken}` },
      data: { runName: 'Placement Attempt' },
    });
    expect(res.status()).toBe(403);
  });

  test('strictly rejects QA operations in production even when ENABLE_QA_CODING_DATA is true', () => {
    const origNodeEnv = process.env.NODE_ENV;
    const origFlag = process.env.ENABLE_QA_CODING_DATA;
    try {
      process.env.NODE_ENV = 'production';
      process.env.ENABLE_QA_CODING_DATA = 'true';

      let statusCode = 0;
      let jsonPayload: any = null;
      let nextCalled = false;

      const mockRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: any) {
          jsonPayload = data;
          return this;
        },
      };

      checkQaEnvironmentAllowed({} as any, mockRes, () => { nextCalled = true; });

      expect(statusCode).toBe(403);
      expect(nextCalled).toBe(false);
      expect(jsonPayload?.error).toMatch(/strictly prohibited in the production environment/i);
    } finally {
      process.env.NODE_ENV = origNodeEnv;
      process.env.ENABLE_QA_CODING_DATA = origFlag;
    }
  });

  test('strictly rejects QA operations outside production when ENABLE_QA_CODING_DATA is missing or false', () => {
    const origNodeEnv = process.env.NODE_ENV;
    const origFlag = process.env.ENABLE_QA_CODING_DATA;
    try {
      process.env.NODE_ENV = 'development';
      delete process.env.ENABLE_QA_CODING_DATA;

      let statusCode = 0;
      let jsonPayload: any = null;
      let nextCalled = false;

      const mockRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: any) {
          jsonPayload = data;
          return this;
        },
      };

      checkQaEnvironmentAllowed({} as any, mockRes, () => { nextCalled = true; });

      expect(statusCode).toBe(403);
      expect(nextCalled).toBe(false);
      expect(jsonPayload?.error).toMatch(/ENABLE_QA_CODING_DATA=true/i);

      process.env.ENABLE_QA_CODING_DATA = 'false';
      statusCode = 0;
      nextCalled = false;

      checkQaEnvironmentAllowed({} as any, mockRes, () => { nextCalled = true; });
      expect(statusCode).toBe(403);
      expect(nextCalled).toBe(false);
    } finally {
      process.env.NODE_ENV = origNodeEnv;
      process.env.ENABLE_QA_CODING_DATA = origFlag;
    }
  });

  test('allows QA operations outside production when ENABLE_QA_CODING_DATA is explicitly true', () => {
    const origNodeEnv = process.env.NODE_ENV;
    const origFlag = process.env.ENABLE_QA_CODING_DATA;
    try {
      process.env.NODE_ENV = 'development';
      process.env.ENABLE_QA_CODING_DATA = 'true';

      let statusCode = 0;
      let nextCalled = false;

      const mockRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json() {
          return this;
        },
      };

      checkQaEnvironmentAllowed({} as any, mockRes, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
      expect(statusCode).toBe(0);
    } finally {
      process.env.NODE_ENV = origNodeEnv;
      process.env.ENABLE_QA_CODING_DATA = origFlag;
    }
  });

  test('permits authenticated admin to manage QA test data', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/admin/qa/coding-stats/runs`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.runs)).toBe(true);
  });
});

test.describe('4. Integration Tests: Lifecycle, Querying, Validation & Deletion', () => {
  let createdRunId: string;
  const testRunName = `Integration Test Run - ${Date.now()}`;

  test('admin creates a new QA test run across all active students', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/admin/qa/coding-stats/generate`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { runName: testRunName },
    });
    expect(res.status()).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.run.name).toBe(testRunName);
    expect(data.summary.recordsCreated).toBeGreaterThan(0);
    expect(data.summary.failures).toBe(0);

    createdRunId = data.run.id;
  });

  test('run appears in available runs list with platform breakdowns', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/admin/qa/coding-stats/runs`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    const found = data.runs.find((r: any) => r.id === createdRunId);
    expect(found).toBeDefined();
    expect(found.name).toBe(testRunName);
    expect(found.leetcode_records).toBeGreaterThan(0);
    expect(found.hackerrank_records).toBeGreaterThan(0);
  });

  test('queries QA stats for run with label "TEST DATA — NOT VERIFIED"', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/admin/qa/coding-stats?runId=${createdRunId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.isTestData).toBe(true);
    expect(data.label).toBe('TEST DATA — NOT VERIFIED');
    expect(data.run.id).toBe(createdRunId);
    expect(data.stats.length).toBeGreaterThan(0);

    // Verify all records have data_source = 'mock'
    for (const record of data.stats) {
      expect(record.data_source).toBe('mock');
      expect(record.easy_count).toBeGreaterThanOrEqual(0);
      expect(record.medium_count).toBeGreaterThanOrEqual(0);
      expect(record.hard_count).toBeGreaterThanOrEqual(0);
      expect(record.total_problems).toBe(record.easy_count + record.medium_count + record.hard_count);
    }
  });

  test('validates UUID query param format on GET', async ({ request }) => {
    const resInvalid = await request.get(`${BASE_URL}/api/admin/qa/coding-stats?runId=invalid-uuid`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(resInvalid.status()).toBe(400);

    const resMissing = await request.get(`${BASE_URL}/api/admin/qa/coding-stats`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(resMissing.status()).toBe(400);

    const randomNonExistentUuid = crypto.randomUUID();
    const resNotFound = await request.get(`${BASE_URL}/api/admin/qa/coding-stats?runId=${randomNonExistentUuid}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(resNotFound.status()).toBe(404);
  });

  test('idempotent generation: regenerating with same runId skips duplicates', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/admin/qa/coding-stats/generate`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { runId: createdRunId, runName: testRunName },
    });
    expect(res.status()).toBe(201);
    const data = await res.json();
    expect(data.summary.recordsCreated).toBe(0);
    expect(data.summary.recordsSkipped).toBeGreaterThan(0);
  });

  test('deleting a QA run cascades and removes mock records without affecting other runs', async ({ request }) => {
    // Create a second run
    const res2 = await request.post(`${BASE_URL}/api/admin/qa/coding-stats/generate`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { runName: 'Run to Preserve' },
    });
    const runToPreserveId = (await res2.json()).run.id;

    // Delete the first run
    const delRes = await request.delete(`${BASE_URL}/api/admin/qa/coding-stats/runs/${createdRunId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(delRes.status()).toBe(200);

    // Verify first run records are gone from database
    const checkDeleted = await pool.query(
      `SELECT count(*)::int AS count FROM qa.student_coding_stats_test WHERE test_run_id = $1`,
      [createdRunId]
    );
    expect(checkDeleted.rows[0].count).toBe(0);

    // Verify second run records are completely intact
    const checkPreserved = await pool.query(
      `SELECT count(*)::int AS count FROM qa.student_coding_stats_test WHERE test_run_id = $1`,
      [runToPreserveId]
    );
    expect(checkPreserved.rows[0].count).toBeGreaterThan(0);

    // Clean up second run
    await request.delete(`${BASE_URL}/api/admin/qa/coding-stats/runs/${runToPreserveId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
  });
});

test.describe('5. Regression Verification: Live Academic & Snapshot Tables Unchanged', () => {
  test('official marks, marksheets, and live snapshots remain strictly unchanged', async () => {
    const [sRes, mRes, msRes, lcRes, hrRes, heRes] = await Promise.all([
      pool.query('SELECT count(*)::int AS count FROM students'),
      pool.query('SELECT count(*)::int AS count FROM marks'),
      pool.query('SELECT count(*)::int AS count FROM marksheets'),
      pool.query('SELECT count(*)::int AS count FROM student_leetcode_snapshots'),
      pool.query('SELECT count(*)::int AS count FROM student_hackerrank_snapshots'),
      pool.query('SELECT count(*)::int AS count FROM student_hackerrank_evidence'),
    ]);

    expect(sRes.rows[0].count).toBe(baselineStudentCount);
    expect(mRes.rows[0].count).toBe(baselineMarksCount);
    expect(msRes.rows[0].count).toBe(baselineMarksheetsCount);
    expect(lcRes.rows[0].count).toBe(baselineLeetcodeSnapshotsCount);
    expect(hrRes.rows[0].count).toBe(baselineHackerrankSnapshotsCount);
    expect(heRes.rows[0].count).toBe(baselineHackerrankEvidenceCount);
  });
});

test.describe('6. Browser UI Verification: Admin QA Controls & Test Indicator', () => {
  test('admin view shows QA subtab with "TEST DATA — NOT VERIFIED" label', async ({ page }) => {
    // 1. Log in as admin
    await page.goto(`${BASE_URL}/`);
    await page.fill('input[type="email"]', 'admin@visionacademy.edu');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Wait for Admin Dashboard to load
    await expect(page.locator('button:has-text("Analytics Settings")')).toBeVisible({ timeout: 15000 });

    // Navigate to Analytics Settings tab
    await page.click('button:has-text("Analytics Settings")');

    // Verify Settings subtabs exist including QA Test Data
    const qaSubTab = page.locator('button:has-text("QA Test Data (Dev Only)")');
    await expect(qaSubTab).toBeVisible({ timeout: 10000 });
    await qaSubTab.click();

    // Verify prominent TEST DATA indicator
    await expect(page.locator('text=TEST DATA — NOT VERIFIED').first()).toBeVisible();

    // Verify generator button
    const generateBtn = page.locator('button:has-text("Generate Test Data for All Active Students")');
    await expect(generateBtn).toBeVisible();

    // Trigger QA generation from UI
    await page.fill('#qa-run-name', 'UI Automated Test Run');
    await generateBtn.click();

    // Verify success toast or run pills appearing
    await expect(page.locator('text=UI Automated Test Run').first()).toBeVisible({ timeout: 25000 });

    // Verify records preview table appears
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('text=MOCK (qa)').first()).toBeVisible();
    await expect(page.locator('text=Showing up to 50 preview records for validation.')).toBeVisible();
  });
});
