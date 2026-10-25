import { test, expect } from '@playwright/test';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { Pool } from 'pg';
import { buildScopedContext } from '../server/ai-assistant.js';
import { sanitizeUrl } from '../src/lib/api.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const BASE_URL = 'http://127.0.0.1:3000';
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is missing from environment. Required for Phase 2A testing.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

let studentUser: any;
let studentToken: string;
let placementUser: any;
let placementToken: string;
let teacherUser: any;
let teacherToken: string;

test.beforeAll(async () => {
  const [studentRes, placementRes, teacherRes] = await Promise.all([
    pool.query(`SELECT id, email, role, full_name FROM users WHERE role='student' LIMIT 1`),
    pool.query(`SELECT id, email, role, full_name FROM users WHERE role='placement' LIMIT 1`),
    pool.query(`SELECT id, email, role, full_name FROM users WHERE role='teacher' LIMIT 1`),
  ]);

  studentUser = studentRes.rows[0];
  placementUser = placementRes.rows[0];
  teacherUser = teacherRes.rows[0];

  studentToken = jwt.sign(
    { id: studentUser.id, email: studentUser.email, role: studentUser.role, full_name: studentUser.full_name },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  placementToken = jwt.sign(
    { id: placementUser.id, email: placementUser.email, role: placementUser.role, full_name: placementUser.full_name },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  teacherToken = jwt.sign(
    { id: teacherUser.id, email: teacherUser.email, role: teacherUser.role, full_name: teacherUser.full_name },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
});

test.afterAll(async () => {
  try {
    if (placementUser?.id) {
      await pool.query(
        `UPDATE placement_analytics_visibility
         SET github_enabled = true, leetcode_enabled = true, academic_enabled = true,
             linkedin_enabled = true, hackerrank_enabled = true, hackathon_enabled = true, sports_enabled = true
         WHERE placement_user_id = $1`,
        [placementUser.id]
      );
    }
    if (teacherUser?.id) {
      await pool.query(
        `UPDATE teacher_analytics_visibility
         SET academic_enabled = true, github_enabled = true, leetcode_enabled = true
         WHERE teacher_user_id = $1`,
        [teacherUser.id]
      );
    }
  } catch (_e) {}
  await pool.end();
});

test.describe('Phase 2A: Stored XSS Prevention & URL Validation', () => {
  test('PUT /api/student/profile rejects javascript: URL in portfolio_url with 400', async ({ request }) => {
    const res = await request.put(`${BASE_URL}/api/student/profile`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: { portfolio_url: 'javascript:alert("XSS")' },
    });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/valid.*url|protocol/i);
  });

  test('PUT /api/student/profile rejects javascript: URL in hackerrank_url with 400', async ({ request }) => {
    const res = await request.put(`${BASE_URL}/api/student/profile`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: { hackerrank_url: 'javascript:alert(1)' },
    });
    expect(res.status()).toBe(400);
  });

  test('PUT /api/student/profile rejects URLs exceeding 500 characters with 400', async ({ request }) => {
    const longUrl = 'https://example.com/' + 'a'.repeat(510);
    const res = await request.put(`${BASE_URL}/api/student/profile`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: { portfolio_url: longUrl },
    });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/500 characters/i);
  });

  test('POST /api/student/projects rejects javascript: URL in live_url or github_url with 400', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/student/projects`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: {
        title: 'XSS Attempt Project',
        description: 'Testing URL sanitization',
        github_url: 'javascript:alert("pwned")',
        live_url: 'https://valid-demo.com',
        date: '2026-10-25',
      },
    });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/valid.*url/i);
  });

  test('POST /api/student/posts rejects javascript: URL in external_link with 400', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/student/posts`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: {
        title: 'Post with Malicious Link',
        description: 'Testing external_link validation',
        category: 'Project Update',
        external_link: 'javascript:alert(document.cookie)',
      },
    });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/valid.*url/i);
  });

  test('sanitizeUrl unit tests: allows valid http/https and strictly rejects javascript:, data:, vbscript:, and leading-whitespace tricks', () => {
    // Valid URLs
    expect(sanitizeUrl('https://github.com/vission-academy')).toBe('https://github.com/vission-academy');
    expect(sanitizeUrl('http://insecure-but-allowed.com/path')).toBe('http://insecure-but-allowed.com/path');
    expect(sanitizeUrl('  https://example.com/trimmed  ')).toBe('https://example.com/trimmed');
    expect(sanitizeUrl('/dashboard/overview')).toBe('/dashboard/overview');

    // Rejected dangerous schemes
    expect(sanitizeUrl('javascript:alert(1)')).toBe('#');
    expect(sanitizeUrl('JAVASCRIPT:alert(document.domain)')).toBe('#');
    expect(sanitizeUrl('  javascript:void(0)  ')).toBe('#');
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('#');
    expect(sanitizeUrl('vbscript:msgbox("malicious")')).toBe('#');
    expect(sanitizeUrl('file:///etc/passwd')).toBe('#');

    // Protocol evasion tricks
    expect(sanitizeUrl(' //evil.com/phish')).toBe('#');
    expect(sanitizeUrl('/\\evil.com')).toBe('#');
    expect(sanitizeUrl('jav\tascript:alert(1)')).toBe('#');

    // Empty / nullish
    expect(sanitizeUrl('')).toBe('');
    expect(sanitizeUrl(null)).toBe('');
    expect(sanitizeUrl(undefined)).toBe('');
  });
});

test.describe('Phase 2A: AI Assistant Visibility Enforcement', () => {
  test('buildScopedContext strips GitHub and Academic data when disabled for placement', async () => {
    // 1. Set placement visibility: github_enabled = false, academic_enabled = false
    await pool.query(
      `INSERT INTO placement_analytics_visibility (placement_user_id, github_enabled, academic_enabled, updated_by)
       VALUES ($1, false, false, $1)
       ON CONFLICT (placement_user_id) DO UPDATE SET github_enabled = false, academic_enabled = false`,
      [placementUser.id]
    );

    const context = await buildScopedContext(
      { id: placementUser.id, email: placementUser.email, role: 'placement', full_name: placementUser.full_name },
      `@${studentUser.full_name}`
    );

    expect(context).not.toContain('• GitHub:');
    expect(context).not.toContain('• Backlogs:');
    expect(context).not.toContain('Average profile strength:');

    // Reset visibility back to true
    await pool.query(
      `UPDATE placement_analytics_visibility SET github_enabled = true, academic_enabled = true WHERE placement_user_id = $1`,
      [placementUser.id]
    );
  });

  test('buildScopedContext strips assessment and marks data when academic_enabled is false for teacher', async () => {
    // 1. Set teacher visibility: academic_enabled = false
    await pool.query(
      `INSERT INTO teacher_analytics_visibility (teacher_user_id, academic_enabled, updated_by)
       VALUES ($1, false, $1)
       ON CONFLICT (teacher_user_id) DO UPDATE SET academic_enabled = false`,
      [teacherUser.id]
    );

    const context = await buildScopedContext(
      { id: teacherUser.id, email: teacherUser.email, role: 'teacher', full_name: teacherUser.full_name },
      `@${studentUser.full_name}`
    );

    expect(context).not.toContain('Assessments Breakdown:');
    expect(context).not.toContain('marks recorded');

    // Reset visibility back to true
    await pool.query(
      `UPDATE teacher_analytics_visibility SET academic_enabled = true WHERE teacher_user_id = $1`,
      [teacherUser.id]
    );
  });

  test('POST /api/placement/ai-query strips GitHub and LeetCode when disabled in visibility', async ({ request }) => {
    // 1. Disable github and leetcode for placement officer
    await pool.query(
      `INSERT INTO placement_analytics_visibility (placement_user_id, github_enabled, leetcode_enabled, updated_by)
       VALUES ($1, false, false, $1)
       ON CONFLICT (placement_user_id) DO UPDATE SET github_enabled = false, leetcode_enabled = false`,
      [placementUser.id]
    );

    // Ensure student has github and leetcode data populated
    await pool.query(
      `UPDATE students
       SET github_data = '{"status":"SYNCED","publicRepos":15,"languages":["TypeScript","Python"]}',
           leetcode_data = '{"status":"SYNCED","totalSolved":120,"easySolved":50,"mediumSolved":60,"hardSolved":10}'
       WHERE id = $1`,
      [studentUser.id]
    );

    const res = await request.post(`${BASE_URL}/api/placement/ai-query`, {
      headers: { Authorization: `Bearer ${placementToken}` },
      data: { query: `@${studentUser.full_name}` },
    });

    expect(res.status()).toBe(200);
    const json = await res.json();
    const answer = json.answer || '';

    // Verify response does not contain GitHub repo or LeetCode problem counts
    expect(answer).not.toMatch(/github/i);
    expect(answer).not.toMatch(/leetcode/i);
    expect(answer).not.toContain('120 solved');
    expect(answer).not.toContain('15 repos');

    // Restore visibility to true
    await pool.query(
      `UPDATE placement_analytics_visibility SET github_enabled = true, leetcode_enabled = true WHERE placement_user_id = $1`,
      [placementUser.id]
    );
  });
});

test.describe('Phase 2A: Auth Route Rate Limiting', () => {
  test('POST /api/auth/reset-first-login-password enforces rate limit after repeated calls', async ({ request }) => {
    let hitRateLimit = false;
    for (let i = 0; i < 10; i++) {
      const res = await request.post(`${BASE_URL}/api/auth/reset-first-login-password`, {
        headers: { Authorization: `Bearer ${studentToken}` },
        data: { newPassword: 'short' },
      });
      if (res.status() === 429) {
        hitRateLimit = true;
        break;
      }
    }
    expect(hitRateLimit).toBe(true);
  });

  test('POST /api/auth/change-password enforces rate limit after repeated calls', async ({ request }) => {
    let hitRateLimit = false;
    for (let i = 0; i < 10; i++) {
      const res = await request.post(`${BASE_URL}/api/auth/change-password`, {
        headers: { Authorization: `Bearer ${studentToken}` },
        data: { currentPassword: 'wrong', newPassword: 'new-valid-pass-123' },
      });
      if (res.status() === 429) {
        hitRateLimit = true;
        break;
      }
    }
    expect(hitRateLimit).toBe(true);
  });
});
