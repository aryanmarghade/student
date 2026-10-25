import { test, expect } from '@playwright/test';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { Pool } from 'pg';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const BASE_URL = 'http://127.0.0.1:3000';
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is missing from environment. Required for RBAC testing.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

let adminToken: string;
let teacherToken: string;
let placementToken: string;
let studentToken: string;
let expiredToken: string;
let mustResetUserToken: string;

test.beforeAll(async () => {
  // Fetch real users from local dev database
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

  expiredToken = jwt.sign(
    { id: admin.id, email: admin.email, role: admin.role, full_name: admin.full_name },
    JWT_SECRET,
    { expiresIn: '-10s' }
  );

  // Set up a user specifically flagged with must_reset_password = TRUE
  await pool.query(
    `INSERT INTO users (id, email, password_hash, role, full_name, is_active, must_reset_password)
     VALUES ('usr_test_must_reset', 'mustreset.test@visionacademy.edu', '$2a$10$abcdefghijklmnopqrstuu', 'student', 'Must Reset Student', TRUE, TRUE)
     ON CONFLICT (id) DO UPDATE SET must_reset_password = TRUE`
  );
  await pool.query(
    `INSERT INTO students (id, user_id, roll_number)
     VALUES ('std_test_must_reset', 'usr_test_must_reset', 'TEST-RESET-01')
     ON CONFLICT (id) DO NOTHING`
  );

  mustResetUserToken = jwt.sign(
    { id: 'usr_test_must_reset', email: 'mustreset.test@visionacademy.edu', role: 'student', full_name: 'Must Reset Student' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
});

test.afterAll(async () => {
  await pool.query(`DELETE FROM students WHERE id = 'std_test_must_reset'`);
  await pool.query(`DELETE FROM users WHERE id = 'usr_test_must_reset'`);
  await pool.end();
});

test.describe('Vission Academy RBAC Master Endpoint Matrix Suite', () => {

  // ── 1. UNPROTECTED / PUBLIC ENDPOINTS ──────────────────────────────────────
  test('Public Endpoints: /api/health and /api/auth/setup-status are accessible without token', async ({ request }) => {
    const health = await request.get(`${BASE_URL}/api/health`);
    expect(health.status()).toBe(200);

    const setup = await request.get(`${BASE_URL}/api/auth/setup-status`);
    expect(setup.status()).toBe(200);
  });

  // ── 2. NO TOKEN (401 UNAUTHENTICATED) TESTS ────────────────────────────────
  const protectedEndpoints = [
    { method: 'GET', path: '/api/admin/overview' },
    { method: 'GET', path: '/api/admin/audit-logs' },
    { method: 'GET', path: '/api/admin/users' },
    { method: 'GET', path: '/api/admin/academic-records' },
    { method: 'GET', path: '/api/admin/classes' },
    { method: 'GET', path: '/api/admin/departments' },
    { method: 'GET', path: '/api/admin/semesters' },
    { method: 'GET', path: '/api/admin/subjects' },
    { method: 'GET', path: '/api/admin/teacher-assignments' },
    { method: 'GET', path: '/api/admin/marksheets' },
    { method: 'GET', path: '/api/admin/notifications' },
    { method: 'GET', path: '/api/admin/events' },
    { method: 'GET', path: '/api/admin/analytics' },
    { method: 'GET', path: '/api/admin/analytics-visibility/all' },
    { method: 'GET', path: '/api/teacher/visibility-settings' },
    { method: 'GET', path: '/api/teacher/assignments' },
    { method: 'GET', path: '/api/teacher/classes/cls_y2_a/students' },
    { method: 'GET', path: '/api/teacher/notifications' },
    { method: 'GET', path: '/api/placement/visibility' },
    { method: 'GET', path: '/api/placement/dashboard' },
    { method: 'GET', path: '/api/student/profile' },
    { method: 'GET', path: '/api/student/marks' },
    { method: 'GET', path: '/api/student/documents' },
    { method: 'GET', path: '/api/student/projects' },
    { method: 'GET', path: '/api/student/notifications' },
    { method: 'GET', path: '/api/student/posts' },
  ];

  for (const ep of protectedEndpoints) {
    test(`No Token -> 401 on ${ep.method} ${ep.path}`, async ({ request }) => {
      const res = await request.fetch(`${BASE_URL}${ep.path}`, { method: ep.method });
      expect(res.status()).toBe(401);
    });
  }

  // ── 3. EXPIRED TOKEN (401 UNAUTHORIZED) TESTS ──────────────────────────────
  test('Expired Token -> 401 on Admin Overview', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/admin/overview`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    expect(res.status()).toBe(401);
  });

  test('Expired Token -> 401 on Teacher Assignments', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/teacher/assignments`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    expect(res.status()).toBe(401);
  });

  test('Expired Token -> 401 on Placement Dashboard', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/placement/dashboard`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    expect(res.status()).toBe(401);
  });

  test('Expired Token -> 401 on Student Profile', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/student/profile`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    expect(res.status()).toBe(401);
  });

  // ── 4. CROSS-ROLE VIOLATION (403 FORBIDDEN) TESTS ──────────────────────────
  test('Wrong Role: Student calling Admin route (/api/admin/users) -> 403', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(res.status()).toBe(403);
  });

  test('Wrong Role: Student calling Teacher route (/api/teacher/assignments) -> 403', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/teacher/assignments`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(res.status()).toBe(403);
  });

  test('Wrong Role: Student calling Placement route (/api/placement/dashboard) -> 403', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/placement/dashboard`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(res.status()).toBe(403);
  });

  test('Wrong Role: Teacher calling Admin route (/api/admin/overview) -> 403', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/admin/overview`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(res.status()).toBe(403);
  });

  test('Wrong Role: Teacher calling Placement route (/api/placement/dashboard) -> 403', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/placement/dashboard`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(res.status()).toBe(403);
  });

  test('Wrong Role: Placement calling Admin route (/api/admin/overview) -> 403', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/admin/overview`, {
      headers: { Authorization: `Bearer ${placementToken}` },
    });
    expect(res.status()).toBe(403);
  });

  test('Wrong Role: Placement calling Teacher route (/api/teacher/assignments) -> 403', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/teacher/assignments`, {
      headers: { Authorization: `Bearer ${placementToken}` },
    });
    expect(res.status()).toBe(403);
  });

  // ── 5. IDOR & SCOPE INTEGRITY TESTS ────────────────────────────────────────
  test('IDOR: Teacher accessing unassigned class students (/api/teacher/classes/cls_unassigned_test/students) -> 403', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/teacher/classes/cls_unassigned_test/students`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(res.status()).toBe(403);
  });

  test('IDOR: Teacher accessing unassigned student profile -> 403 or 404', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/teacher/students/std_outside_scope_test/full-profile`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect([403, 404]).toContain(res.status());
  });

  // ── 6. VISIBILITY TOGGLES ENFORCEMENT ───────────────────────────────────────
  test('Visibility Enforcement: Placement Dashboard respects active visibility flags', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/placement/dashboard`, {
      headers: { Authorization: `Bearer ${placementToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('summary');
    expect(body).toHaveProperty('students');
  });

  // ── 7. CRITICAL VULNERABILITY FINDING TESTS (EXPECTED TO FAIL CURRENTLY) ────

  test('Server blocks API access when must_reset_password is true', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/student/profile`, {
      headers: { Authorization: `Bearer ${mustResetUserToken}` },
    });
    expect(res.status()).toBe(403);
  });

  test('Placement officer cannot self-override admin visibility permissions', async ({ request }) => {
    const res = await request.put(`${BASE_URL}/api/placement/visibility`, {
      headers: { Authorization: `Bearer ${placementToken}` },
      data: {
        github_enabled: true,
        leetcode_enabled: true,
        academic_enabled: true,
      },
    });
    expect(res.status()).toBe(403);
  });

});
