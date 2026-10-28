import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.demo'), override: true });

const DEMO_URL = 'http://127.0.0.1:3001';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'DemoPassSecure2026!';
const QA_EVIDENCE_DIR = path.resolve(process.cwd(), 'reports/qa-evidence');

test.use({ baseURL: DEMO_URL });

test.describe('Part A: Authentication, Sessions & Password Reset QA', () => {
  let pool: pg.Pool;

  test.beforeAll(async () => {
    if (!fs.existsSync(QA_EVIDENCE_DIR)) {
      fs.mkdirSync(QA_EVIDENCE_DIR, { recursive: true });
    }
    const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:aryan@localhost:5432/vission_academy_demo';
    pool = new pg.Pool({ connectionString: dbUrl });
  });

  test.afterAll(async () => {
    if (pool) {
      await pool.query(`DELETE FROM users WHERE id = 'demo_temp_reset_user'`).catch(() => {});
      await pool.end();
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      const headers = { ...route.request().headers(), 'x-bypass-ratelimit': 'qa-stress-suite' };
      await route.continue({ headers });
    });
  });

  const roles = [
    { role: 'admin', email: 'demo_admin@vissionacademy.edu', checkText: 'Institutional Administration' },
    { role: 'teacher', email: 'demo_teacher1@vissionacademy.edu', checkText: 'Faculty Class Workspace' },
    { role: 'placement', email: 'demo_placement@vissionacademy.edu', checkText: 'Placement Office Dashboard' },
    { role: 'student', email: 'demo_student_top@vissionacademy.edu', checkText: 'Academic Information' },
  ];

  for (const r of roles) {
    test(`A1. Login and Logout flow for ${r.role}`, async ({ page }) => {
      await page.goto(`${DEMO_URL}/#login`);
      await page.waitForLoadState('networkidle');

      await page.fill('input[type="email"]', r.email);
      await page.fill('input[type="password"]', DEMO_PASSWORD);
      await page.click('button[type="submit"]');

      // Verify authenticated view
      await expect(page.locator(`text=${r.checkText}`).first()).toBeVisible({ timeout: 15000 });
      await page.waitForTimeout(1000);

      const shotPath = path.join(QA_EVIDENCE_DIR, `partA_login_${r.role}.png`);
      await page.screenshot({ path: shotPath, fullPage: true });
      expect(fs.existsSync(shotPath)).toBe(true);

      // Perform Logout
      const logoutBtn = page.locator('button[title="Sign Out"]').or(page.locator('button:has-text("Sign Out")')).first();
      await expect(logoutBtn).toBeVisible({ timeout: 5000 });
      await logoutBtn.click();
      await page.waitForTimeout(1000);

      // Verify returned to login view
      await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10000 });
      const logoutShotPath = path.join(QA_EVIDENCE_DIR, `partA_logout_${r.role}.png`);
      await page.screenshot({ path: logoutShotPath, fullPage: true });
      expect(fs.existsSync(logoutShotPath)).toBe(true);
    });
  }

  test('A2. Forced password reset flow (must_reset_password = true)', async ({ page }) => {
    const tempId = 'demo_temp_reset_user';
    const tempEmail = 'demo_reset_student@vissionacademy.edu';
    const tempInitialPass = 'InitialTempPass2026!';
    const tempNewPass = 'NewSecurePass2026!';

    const hash = await bcrypt.hash(tempInitialPass, 10);
    await pool.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active, must_reset_password)
       VALUES ($1, $2, $3, 'student', 'Demo Reset Test Candidate', true, true)
       ON CONFLICT (id) DO UPDATE SET password_hash = $3, must_reset_password = true`,
      [tempId, tempEmail, hash]
    );

    // Also link student row so student view can render upon login
    await pool.query(
      `INSERT INTO students (id, user_id, roll_number, class_id, department_id, bio, profile_strength)
       VALUES ('demo_std_temp_reset', $1, 'DEMO_RST_999', 'cls_y1_a', 'dept_cs', 'Temporary student for reset verification', 50)
       ON CONFLICT (id) DO NOTHING`,
      [tempId]
    );

    await page.goto(`${DEMO_URL}/#login`);
    await page.fill('input[type="email"]', tempEmail);
    await page.fill('input[type="password"]', tempInitialPass);
    await page.click('button[type="submit"]');

    // Verify Password Reset prompt appears
    await expect(page.locator('text=Mandatory Password Setup')).toBeVisible({ timeout: 10000 });

    const resetPromptShot = path.join(QA_EVIDENCE_DIR, 'partA_forced_reset_prompt.png');
    await page.screenshot({ path: resetPromptShot, fullPage: true });
    expect(fs.existsSync(resetPromptShot)).toBe(true);

    // Fill new password and confirm
    await page.locator('input[placeholder="At least 8 characters"]').fill(tempNewPass);
    await page.locator('input[placeholder="Re-type new password"]').fill(tempNewPass);

    const submitResetBtn = page.locator('button:has-text("Save & Enter Workspace")');
    await submitResetBtn.click();
    await page.waitForTimeout(2000);

    // Verify user is now authenticated and must_reset_password is false in DB
    const checkDb = await pool.query(`SELECT must_reset_password FROM users WHERE id = $1`, [tempId]);
    expect(checkDb.rows[0].must_reset_password).toBe(false);

    const afterResetShot = path.join(QA_EVIDENCE_DIR, 'partA_forced_reset_success.png');
    await page.screenshot({ path: afterResetShot, fullPage: true });

    // Cleanup
    await pool.query(`DELETE FROM students WHERE id = 'demo_std_temp_reset'`).catch(() => {});
    await pool.query(`DELETE FROM users WHERE id = $1`, [tempId]).catch(() => {});
  });

  test('A3. Session token refresh and cookie rotation (/api/auth/refresh)', async ({ request }) => {
    // 1. Perform login via API
    const loginRes = await request.post(`${DEMO_URL}/api/auth/login`, {
      data: { email: 'demo_admin@vissionacademy.edu', password: DEMO_PASSWORD },
      headers: { 'x-bypass-ratelimit': 'qa-stress-suite' }
    });
    expect(loginRes.status()).toBe(200);
    const loginData = await loginRes.json();
    expect(loginData.token).toBeDefined();

    // Check Set-Cookie
    const setCookie = loginRes.headersArray().find(h => h.name.toLowerCase() === 'set-cookie')?.value || '';
    expect(setCookie.toLowerCase()).toContain('va_refresh_token=');
    expect(setCookie.toLowerCase()).toContain('httponly');
    expect(setCookie.toLowerCase()).toContain('samesite=strict');

    const cookieMatch = setCookie.match(/va_refresh_token=([^;]+)/);
    expect(cookieMatch).toBeTruthy();
    const originalRefreshToken = cookieMatch![1];

    // 2. Call refresh
    const refreshRes = await request.post(`${DEMO_URL}/api/auth/refresh`, {
      headers: {
        'Cookie': `va_refresh_token=${originalRefreshToken}`,
        'X-Auth-Refresh': '1',
        'x-bypass-ratelimit': 'qa-stress-suite'
      }
    });
    expect(refreshRes.status()).toBe(200);
    const refreshData = await refreshRes.json();
    expect(refreshData.token).toBeDefined();

    // Verify rotated cookie
    const refreshSetCookie = refreshRes.headersArray().find(h => h.name.toLowerCase() === 'set-cookie')?.value || '';
    expect(refreshSetCookie).toBeTruthy();
    const rotatedCookieMatch = refreshSetCookie.match(/va_refresh_token=([^;]+)/);
    expect(rotatedCookieMatch).toBeTruthy();
    expect(rotatedCookieMatch![1]).not.toBe(originalRefreshToken);
  });
});
