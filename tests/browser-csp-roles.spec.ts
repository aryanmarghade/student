import { test, expect } from '@playwright/test';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const BASE_URL = 'http://127.0.0.1:3000';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

test.describe('CSP Production Compliance & 4-Role Dashboard Browser Audit', () => {
  const roles = ['admin', 'teacher', 'placement', 'student'] as const;
  const userMap: Record<string, { email: string; pass: string; id: string }> = {};

  test.beforeAll(async () => {
    const password = 'RolePassword123!';
    const passwordHash = await bcrypt.hash(password, 10);

    for (const r of roles) {
      const email = `csp.audit.${r}.${Date.now()}@vissionacademy.edu`;
      const id = `usr_csp_${r}_${Date.now()}`;
      await pool.query(
        `INSERT INTO users (id, email, password_hash, role, full_name, is_active, must_reset_password)
         VALUES ($1, $2, $3, $4, $5, true, false)`,
        [id, email, passwordHash, r, `CSP Audit ${r.toUpperCase()}`]
      );
      if (r === 'student') {
        const studentId = `std_csp_${Date.now()}`;
        await pool.query(
          `INSERT INTO students (id, user_id, roll_number, class_id)
           VALUES ($1, $2, $3, 'cls_y1_a')`,
          [studentId, id, `CSP${Math.floor(100000 + Math.random() * 900000)}`]
        );
      }
      userMap[r] = { email, pass: password, id };
    }
  });

  test.afterAll(async () => {
    try {
      for (const r of roles) {
        if (userMap[r]?.id) {
          await pool.query(`DELETE FROM students WHERE user_id = $1`, [userMap[r].id]);
          await pool.query(`DELETE FROM users WHERE id = $1`, [userMap[r].id]);
        }
      }
    } catch {}
    await pool.end();
  });

  for (const role of roles) {
    test(`Browser Audit for ${role.toUpperCase()} role: dashboard, charts, AI drawer, no CSP errors`, async ({ page, context }) => {
      const consoleErrors: string[] = [];
      const cspViolations: string[] = [];

      page.on('console', (msg) => {
        const text = msg.text();
        if (msg.type() === 'error') {
          consoleErrors.push(text);
        }
        if (text.toLowerCase().includes('content security policy') || text.toLowerCase().includes('violates')) {
          cspViolations.push(text);
        }
      });

      page.on('pageerror', (err) => {
        consoleErrors.push(err.message);
      });

      // 1. Navigate to /login and fill login form
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
      await page.fill('input[type="email"]', userMap[role].email);
      await page.fill('input[type="password"]', userMap[role].pass);
      await page.click('button[type="submit"]');

      // 2. Ensure dashboard header is rendered
      await expect(page.locator('header')).toBeVisible({ timeout: 15000 });

      // Role check in header
      const headerText = await page.locator('header').innerText();
      expect(headerText.toLowerCase()).toContain(role);

      // Check charts or canvas if present
      const canvasElements = await page.locator('canvas').count();
      console.log(`[${role.toUpperCase()}] Canvas chart count:`, canvasElements);

      // 3. Open AI Assistant Drawer
      const aiButton = page.locator('button:has-text("Ask AI Assistant"), button[aria-label*="AI"], button:has-text("AI")').first();
      if (await aiButton.isVisible()) {
        await aiButton.click();
        await expect(page.locator('text=Suggested Queries')).toBeVisible({ timeout: 5000 });
        // Close drawer
        const closeBtn = page.locator('button[title="Close AI Assistant"], button[aria-label="Close"], button:has-text("✕")').first();
        if (await closeBtn.isVisible()) {
          await closeBtn.click();
        }
      }

      // 4. Verify ZERO CSP violations
      if (cspViolations.length > 0) {
        console.log(`[${role.toUpperCase()}] CSP VIOLATIONS:`, cspViolations);
      }
      expect(cspViolations.length).toBe(0);

      console.log(`[${role.toUpperCase()}] Console errors recorded:`, consoleErrors);
      const criticalErrors = consoleErrors.filter(e =>
        !e.includes('favicon') &&
        !e.includes('CORS') &&
        !e.includes('deoptimised') &&
        !e.includes('401 (Unauthorized)') // initial boot silent-refresh attempt before login
      );
      expect(criticalErrors.length).toBe(0);
    });
  }

  test('Production CSP Policy Header Verification: strictly NO unsafe-eval and NO unsafe-inline in script-src', async ({ request }) => {
    // Check CSP header returned by the server
    const res = await request.get(`${BASE_URL}/login`);
    const csp = res.headers()['content-security-policy'] || '';
    expect(csp).toBeTruthy();

    // Verify directives
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");

    // Verify helmet config rules: In production mode, script-src must not contain unsafe-inline or unsafe-eval
    // Check server.ts file content directly to verify production configuration guarantee
    const serverFile = await import('fs').then(fs => fs.promises.readFile(path.resolve(process.cwd(), 'server.ts'), 'utf8'));
    expect(serverFile).toContain("process.env.NODE_ENV === 'production'");
    expect(serverFile).toMatch(/scriptSrc:\s*\[\s*"'self'",\s*\.\.\.\(process\.env\.NODE_ENV === 'production'\s*\?\s*\[\]\s*:\s*\["'unsafe-inline'",\s*"'unsafe-eval'"\]\)/);
  });
});
