import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const BASE_URL = 'http://127.0.0.1:3000';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const SCREENSHOT_DIR = path.resolve(process.cwd(), 'scratch/screenshots');

test.describe('Phase 4: Axe Accessibility & Responsive Audits Across All 4 Roles', () => {
  const roles = ['admin', 'teacher', 'placement', 'student'] as const;
  const userMap: Record<string, { email: string; pass: string; id: string; studentId?: string }> = {};

  test.beforeAll(async () => {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }

    const password = 'RolePassword123!';
    const passwordHash = await bcrypt.hash(password, 10);

    for (const r of roles) {
      const email = `phase4.axe.${r}.${Date.now()}@vissionacademy.edu`;
      const id = `usr_p4_axe_${r}_${Date.now()}`;
      await pool.query(
        `INSERT INTO users (id, email, password_hash, role, full_name, is_active, must_reset_password)
         VALUES ($1, $2, $3, $4, $5, true, false)`,
        [id, email, passwordHash, r, `Phase4 ${r.toUpperCase()} User`]
      );
      if (r === 'student') {
        const studentId = `std_p4_axe_${Date.now()}`;
        await pool.query(
          `INSERT INTO students (id, user_id, roll_number, class_id)
           VALUES ($1, $2, $3, 'cls_y1_a')`,
          [studentId, id, `AXE${Math.floor(100000 + Math.random() * 900000)}`]
        );
        userMap[r] = { email, pass: password, id, studentId };
      } else {
        userMap[r] = { email, pass: password, id };
      }
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      const headers = { ...route.request().headers(), 'x-bypass-ratelimit': 'qa-stress-suite' };
      await route.continue({ headers });
    });
  });

  test.afterAll(async () => {
    try {
      for (const r of roles) {
        if (userMap[r]?.id) {
          if (userMap[r].studentId) {
            await pool.query(`DELETE FROM students WHERE user_id = $1`, [userMap[r].id]);
          }
          await pool.query(`DELETE FROM users WHERE id = $1`, [userMap[r].id]);
        }
      }
    } catch (e) {
      console.warn('Cleanup error:', e);
    }
    await pool.end();
  });

  for (const role of roles) {
    test(`Axe Accessibility & Multi-Viewport Audit for ${role.toUpperCase()} Role`, async ({ page }) => {
      const u = userMap[role];

      // 1. Login
      await page.goto(`${BASE_URL}/login`);
      await page.fill('input[type="email"]', u.email);
      await page.fill('input[type="password"]', u.pass);
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL(`${BASE_URL}/${role}`, { timeout: 15000 });

      // Wait for network settle and main view container to be visible
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);

      // 2. Run Axe Accessibility Scan on Main Dashboard
      const accessibilityResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        // Exclude canvas chart internals which are graphical representations with textual table fallbacks
        .exclude('canvas')
        .analyze();

      const seriousOrCritical = accessibilityResults.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical'
      );

      if (seriousOrCritical.length > 0) {
        console.error(
          `Axe Violations for ${role}:`,
          seriousOrCritical.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length }))
        );
      }
      expect(seriousOrCritical).toEqual([]);

      // 3. Multi-Viewport Screenshots (375px mobile, 768px tablet, 1440px desktop)
      const viewports = [
        { width: 375, height: 667, name: '375_mobile' },
        { width: 768, height: 1024, name: '768_tablet' },
        { width: 1440, height: 900, name: '1440_desktop' },
      ];

      for (const vp of viewports) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.waitForTimeout(300);
        const screenshotPath = path.join(SCREENSHOT_DIR, `${role}_${vp.name}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        expect(fs.existsSync(screenshotPath)).toBe(true);
      }
    });
  }
});
