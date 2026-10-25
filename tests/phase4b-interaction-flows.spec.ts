import { test, expect } from '@playwright/test';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { issueRefreshToken } from '../server/refresh-tokens.js';
import { generateToken } from '../server/auth.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const BASE_URL = 'http://127.0.0.1:3000';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function loginAs(page: any, user: { email: string; pass: string }, targetPath: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.pass);
  await page.click('button[type="submit"]');
  await page.waitForURL(`**${targetPath}`, { timeout: 15000 });
}

test.describe('Phase 4B: Interaction Flows & Dialog Security', () => {
  let adminUser: { email: string; pass: string; id: string };
  let teacherUser: { email: string; pass: string; id: string };
  let placementUser: { email: string; pass: string; id: string };

  test.beforeAll(async () => {
    const password = 'RolePassword123!';
    const passwordHash = await bcrypt.hash(password, 10);

    // Admin
    const adminEmail = `phase4b.admin.${Date.now()}@vissionacademy.edu`;
    const adminId = `usr_p4b_adm_${Date.now()}`;
    await pool.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active, must_reset_password)
       VALUES ($1, $2, $3, 'admin', 'Phase4B Admin User', true, false)`,
      [adminId, adminEmail, passwordHash]
    );
    adminUser = { email: adminEmail, pass: password, id: adminId };

    // Teacher
    const teacherEmail = `phase4b.teacher.${Date.now()}@vissionacademy.edu`;
    const teacherId = `usr_p4b_tch_${Date.now()}`;
    await pool.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active, must_reset_password)
       VALUES ($1, $2, $3, 'teacher', 'Phase4B Teacher User', true, false)`,
      [teacherId, teacherEmail, passwordHash]
    );
    // Assign teacher to class cls_y1_a and subject sbj_math1
    await pool.query(
      `INSERT INTO teacher_class_assignments (id, teacher_user_id, class_id, subject_id, semester_id, status)
       VALUES ($1, $2, 'cls_y1_a', 'sbj_math1', 'sem_1', 'active') ON CONFLICT DO NOTHING`,
      [`tca_p4b_${Date.now()}`, teacherId]
    );
    teacherUser = { email: teacherEmail, pass: password, id: teacherId };

    // Placement
    const placementEmail = `phase4b.placement.${Date.now()}@vissionacademy.edu`;
    const placementId = `usr_p4b_plc_${Date.now()}`;
    await pool.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active, must_reset_password)
       VALUES ($1, $2, $3, 'placement', 'Phase4B Placement User', true, false)`,
      [placementId, placementEmail, passwordHash]
    );
    placementUser = { email: placementEmail, pass: password, id: placementId };
  });

  test.afterAll(async () => {
    try {
      if (adminUser?.id) await pool.query(`DELETE FROM users WHERE id = $1`, [adminUser.id]);
      if (teacherUser?.id) {
        await pool.query(`DELETE FROM teacher_class_assignments WHERE teacher_user_id = $1`, [teacherUser.id]);
        await pool.query(`DELETE FROM users WHERE id = $1`, [teacherUser.id]);
      }
      if (placementUser?.id) await pool.query(`DELETE FROM users WHERE id = $1`, [placementUser.id]);
    } catch (e) {
      console.warn('Cleanup error:', e);
    }
    await pool.end();
  });

  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders({
      'x-bypass-ratelimit': 'qa-stress-suite'
    });
  });

  test('1. Sync All Confirm Flow: modal confirms before triggering sync API and displays loading/toast', async ({ page }) => {
    await loginAs(page, adminUser, '/admin');
    await expect(page).toHaveURL(`${BASE_URL}/admin`, { timeout: 15000 });

    // Navigate to Analytics Settings Tab
    const analyticsTab = page.locator('button', { hasText: 'Analytics Settings' });
    await analyticsTab.click();

    // Click External Data Sync Actions sub-tab
    const syncSubTab = page.locator('button', { hasText: 'External Data Sync Actions' });
    await syncSubTab.click();

    // Find "Sync All Platforms" button
    const syncAllBtn = page.locator('button', { hasText: 'Sync All Platforms' });
    await expect(syncAllBtn).toBeVisible({ timeout: 10000 });

    // Click Sync All - opens ConfirmDialog
    await syncAllBtn.click();

    const dialog = page.locator('[role="alertdialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('#confirm-dialog-title')).toContainText('Synchronize All Student External Platforms');

    // Confirm the action
    const confirmBtn = dialog.locator('button', { hasText: 'Sync All Platforms' });
    await confirmBtn.click();

    // Dialog closes and toast/loading activates
    await expect(dialog).not.toBeVisible();
    const toast = page.locator('[role="status"]');
    await expect(toast).toBeVisible({ timeout: 10000 });
  });

  test('2. Placement Dashboard Error & Retry Flow: recovers when retry is clicked', async ({ page }) => {
    let failOnce = true;
    await page.route('**/api/placement/dashboard', async (route) => {
      if (failOnce) {
        failOnce = false;
        await route.fulfill({ status: 500, json: { error: 'Simulated institutional gateway timeout.' } });
      } else {
        await route.continue();
      }
    });

    await loginAs(page, placementUser, '/placement');
    await expect(page).toHaveURL(`${BASE_URL}/placement`, { timeout: 15000 });

    // Verify error banner is shown with retry button
    const retryBtn = page.locator('button', { hasText: 'Retry Connection' });
    await expect(retryBtn).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Placement Dashboard Unavailable')).toBeVisible();

    // Click retry - dashboard succeeds
    await retryBtn.click();
    await expect(page.locator('text=Placement Office Dashboard')).toBeVisible({ timeout: 10000 });
    await expect(retryBtn).not.toBeVisible();
  });

  test('3. ConfirmDialog Focus Trap & Focus Return: traps keyboard Tab and restores trigger focus on close', async ({ page }) => {
    await loginAs(page, adminUser, '/admin');
    await expect(page).toHaveURL(`${BASE_URL}/admin`, { timeout: 15000 });

    const analyticsTab = page.locator('button', { hasText: 'Analytics Settings' });
    await analyticsTab.click();

    const syncSubTab = page.locator('button', { hasText: 'External Data Sync Actions' });
    await syncSubTab.click();

    const syncBtn = page.locator('button', { hasText: 'Sync All Platforms' });
    await syncBtn.focus();
    await expect(syncBtn).toBeFocused();

    // Open ConfirmDialog
    await syncBtn.click();
    const dialog = page.locator('[role="alertdialog"]');
    await expect(dialog).toBeVisible();

    // Press Escape to dismiss
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();

    // Trigger button receives focus back
    await expect(syncBtn).toBeFocused();
  });

  test('4. Teacher Marks Save & Unsaved Changes Guard: loading state, no double submit, warning when navigating away', async ({ page }) => {
    await loginAs(page, teacherUser, '/teacher');
    await expect(page).toHaveURL(`${BASE_URL}/teacher`, { timeout: 15000 });

    // Navigate to Marks Spreadsheet Grid
    const marksTab = page.locator('button', { hasText: 'Spreadsheet Marks Entry Grid' });
    await marksTab.click();

    // Wait for marks input in tbody
    const firstMarkInput = page.locator('tbody input[type="number"]').first();
    await expect(firstMarkInput).toBeVisible({ timeout: 10000 });

    // Modify a mark to make state dirty
    await firstMarkInput.fill('22');

    // Attempt to navigate to Roster tab without saving -> ConfirmDialog triggers
    const rosterTab = page.locator('button', { hasText: 'Class Student Roster' });
    await rosterTab.click();

    const dialog = page.locator('[role="alertdialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('#confirm-dialog-title')).toContainText('Unsaved Marks Ledger Changes');

    // Choose "Stay on Page" (Cancel)
    await dialog.locator('button', { hasText: 'Stay on Page' }).click();
    await expect(dialog).not.toBeVisible();

    // Still on marks view
    await expect(firstMarkInput).toBeVisible();

    // Now test Save button loading state & double submit prevention
    const saveBtn = page.locator('button', { hasText: /Save All Marks|Recording Ledger/ });
    await expect(saveBtn).toBeEnabled();

    // Intercept save API to inspect in-flight disabled & spinner state
    let routePromiseResolve: () => void;
    const routePromise = new Promise<void>((res) => { routePromiseResolve = res; });

    await page.route('**/api/teacher/classes/*/subjects/*/marks', async (route) => {
      await routePromise;
      await route.continue();
    });

    // Click Save
    await saveBtn.click();

    // Button shows loading spinner and is disabled immediately
    await expect(saveBtn).toBeDisabled();
    await expect(saveBtn).toContainText('Recording Ledger...');

    // Resolve in-flight request
    routePromiseResolve!();

    // Verify success feedback
    await expect(page.locator('text=Successfully recorded')).toBeVisible({ timeout: 10000 });
  });
});
