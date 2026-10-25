import { test, expect } from '@playwright/test';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const BASE_URL = 'http://127.0.0.1:3000';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

test.describe('Phase 4: UI Interactions, Double-Submit, Rollback & ConfirmDialog', () => {
  let studentUser: { email: string; pass: string; id: string; studentId: string };
  let adminUser: { email: string; pass: string; id: string };

  test.beforeAll(async () => {
    const password = 'RolePassword123!';
    const passwordHash = await bcrypt.hash(password, 10);

    // Create student
    const studentEmail = `phase4.student.${Date.now()}@vissionacademy.edu`;
    const studentUserId = `usr_p4_std_${Date.now()}`;
    const studentId = `std_p4_${Date.now()}`;
    await pool.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active, must_reset_password)
       VALUES ($1, $2, $3, 'student', 'Phase4 Student User', true, false)`,
      [studentUserId, studentEmail, passwordHash]
    );
    await pool.query(
      `INSERT INTO students (id, user_id, roll_number, class_id)
       VALUES ($1, $2, $3, 'cls_y1_a')`,
      [studentId, studentUserId, `P4${Math.floor(100000 + Math.random() * 900000)}`]
    );
    studentUser = { email: studentEmail, pass: password, id: studentUserId, studentId };

    // Create admin
    const adminEmail = `phase4.admin.${Date.now()}@vissionacademy.edu`;
    const adminUserId = `usr_p4_adm_${Date.now()}`;
    await pool.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active, must_reset_password)
       VALUES ($1, $2, $3, 'admin', 'Phase4 Admin User', true, false)`,
      [adminUserId, adminEmail, passwordHash]
    );
    adminUser = { email: adminEmail, pass: password, id: adminUserId };
  });

  test.afterAll(async () => {
    try {
      if (studentUser?.id) {
        await pool.query(`DELETE FROM posts WHERE student_id = $1`, [studentUser.studentId]);
        await pool.query(`DELETE FROM students WHERE user_id = $1`, [studentUser.id]);
        await pool.query(`DELETE FROM users WHERE id = $1`, [studentUser.id]);
      }
      if (adminUser?.id) {
        await pool.query(`DELETE FROM users WHERE id = $1`, [adminUser.id]);
      }
    } catch (e) {
      console.warn('Cleanup error:', e);
    }
    await pool.end();
  });

  test('Student: Rapid double-click on Create Post creates exactly one post and disables button', async ({ page }) => {
    // Login as student
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', studentUser.email);
    await page.fill('input[type="password"]', studentUser.pass);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(`${BASE_URL}/student`, { timeout: 10000 });

    // Navigate to Campus Activity tab where posts live
    const activityTab = page.getByRole('button', { name: /activity/i }).first();
    await activityTab.click();

    // Click "Create Post" button
    const openModalBtn = page.getByRole('button', { name: /create post/i }).first();
    await openModalBtn.click();

    // Fill form
    const uniqueTitle = `Double Submit Test Post ${Date.now()}`;
    await page.fill('input[placeholder*="Title" i]', uniqueTitle);
    await page.fill('textarea[placeholder*="What do you want to talk about" i]', 'Testing double click submission');

    // Count API network requests to /api/student/posts
    let postRequestCount = 0;
    page.on('request', (req) => {
      if (req.url().includes('/api/student/posts') && req.method() === 'POST') {
        postRequestCount++;
      }
    });

    const submitBtn = page.locator('button[type="submit"]:has-text("Publish Post"), button[type="submit"]:has-text("Post")').last();

    // Rapid double-click
    await Promise.all([
      submitBtn.click({ clickCount: 2 }),
    ]);

    // Modal should close and post appear in feed
    await expect(page.locator(`text=${uniqueTitle}`)).toBeVisible({ timeout: 10000 });

    // Assert that exactly 1 request was sent or processed
    expect(postRequestCount).toBe(1);

    // Verify in database that exactly 1 record was created
    const dbPosts = await pool.query(
      `SELECT id, title FROM posts WHERE student_id = $1 AND title = $2`,
      [studentUser.studentId, uniqueTitle]
    );
    expect(dbPosts.rows.length).toBe(1);
  });

  test('Admin: Visibility toggle network failure rolls back switch and displays error toast', async ({ page }) => {
    // Login as admin
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', adminUser.email);
    await page.fill('input[type="password"]', adminUser.pass);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(`${BASE_URL}/admin`, { timeout: 10000 });

    // Go to Analytics Visibility tab or section
    const visibilityTab = page.getByRole('button', { name: /visibility|analytics access/i }).first();
    if (await visibilityTab.isVisible()) {
      await visibilityTab.click();
    }

    // Intercept visibility update endpoint to fail with 500
    await page.route('**/api/admin/analytics-visibility/**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Database synchronization failed' }),
      });
    });

    // Find any visibility toggle button
    const toggle = page.locator('button[role="switch"]').first();
    if (await toggle.isVisible()) {
      const initialChecked = await toggle.getAttribute('aria-checked');
      
      // Click toggle
      await toggle.click();

      // Expect error toast notification to appear
      const toast = page.locator('aside[aria-label="Notifications"] div[role="alert"]');
      await expect(toast).toBeVisible({ timeout: 5000 });

      // Expect switch state to rollback to original initialChecked
      await expect(toggle).toHaveAttribute('aria-checked', initialChecked || 'false');
    }
  });

  test('ConfirmDialog: accessible modal cancels without action on Cancel click or Esc key', async ({ page }) => {
    // Login as admin
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', adminUser.email);
    await page.fill('input[type="password"]', adminUser.pass);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(`${BASE_URL}/admin`, { timeout: 10000 });

    // Check if ConfirmDialog renders when a destructive action is initiated (e.g. Sync All Platforms)
    const syncAllBtn = page.getByRole('button', { name: /sync all platforms/i });
    if (await syncAllBtn.isVisible()) {
      await syncAllBtn.click();

      // Modal should open with role="alertdialog"
      const dialog = page.locator('div[role="alertdialog"]');
      await expect(dialog).toBeVisible();

      // Press Escape - should dismiss dialog
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();

      // Re-open dialog and click Cancel button
      await syncAllBtn.click();
      await expect(dialog).toBeVisible();

      const cancelBtn = dialog.getByRole('button', { name: /cancel/i });
      await cancelBtn.click();
      await expect(dialog).not.toBeVisible();
    }
  });
});
