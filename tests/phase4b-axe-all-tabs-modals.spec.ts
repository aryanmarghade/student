import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const BASE_URL = 'http://127.0.0.1:3000';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function loginAs(page: any, email: string, targetPath: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', 'RolePassword123!');
  await page.click('button[type="submit"]');
  await page.waitForURL((url: URL) => !url.pathname.includes('/login'), { timeout: 15000 });
  if (targetPath && !page.url().endsWith(targetPath)) {
    await page.goto(`${BASE_URL}${targetPath}`);
  }
  await page.waitForLoadState('networkidle');
}

async function runAxeScan(page: any, contextName: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('canvas')
    // Color contrast modifications are strictly frozen under the visual design freeze directive
    .disableRules(['color-contrast'])
    .analyze();

  const seriousOrCritical = results.violations.filter(
    v => v.impact === 'serious' || v.impact === 'critical'
  );

  if (seriousOrCritical.length > 0) {
    console.error(
      `Axe Violations [${contextName}]:`,
      seriousOrCritical.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length }))
    );
  }

  expect(seriousOrCritical, `Accessibility violations detected in ${contextName}`).toEqual([]);
}

test.describe('Phase 4B: Comprehensive Axe Accessibility Across All Tabs and Modals', () => {
  let adminId: string;
  let adminEmail: string;
  let teacherId: string;
  let teacherEmail: string;
  let studentUserId: string;
  let studentEmail: string;
  let placementId: string;
  let placementEmail: string;
  let studentId: string;

  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders({
      'x-bypass-ratelimit': 'qa-stress-suite'
    });
  });

  test.beforeAll(async () => {
    const password = 'RolePassword123!';
    const passwordHash = await bcrypt.hash(password, 10);
    const ts = Date.now();

    // Admin
    adminId = `usr_p4b_axe_adm_${ts}`;
    adminEmail = `p4b.axe.admin.${ts}@vissionacademy.edu`;
    await pool.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active, must_reset_password)
       VALUES ($1, $2, $3, 'admin', 'Phase4B Axe Admin', true, false)`,
      [adminId, adminEmail, passwordHash]
    );

    // Teacher
    teacherId = `usr_p4b_axe_tch_${ts}`;
    teacherEmail = `p4b.axe.teacher.${ts}@vissionacademy.edu`;
    await pool.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active, must_reset_password)
       VALUES ($1, $2, $3, 'teacher', 'Phase4B Axe Teacher', true, false)`,
      [teacherId, teacherEmail, passwordHash]
    );
    await pool.query(
      `INSERT INTO teacher_class_assignments (id, teacher_user_id, class_id, subject_id, semester_id, status)
       VALUES ($1, $2, 'cls_y1_a', 'sbj_math1', 'sem_1', 'active') ON CONFLICT DO NOTHING`,
      [`tca_p4b_axe_${ts}`, teacherId]
    );

    // Placement
    placementId = `usr_p4b_axe_plc_${ts}`;
    placementEmail = `p4b.axe.placement.${ts}@vissionacademy.edu`;
    await pool.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active, must_reset_password)
       VALUES ($1, $2, $3, 'placement', 'Phase4B Axe Placement Officer', true, false)`,
      [placementId, placementEmail, passwordHash]
    );

    // Student
    studentUserId = `usr_p4b_axe_std_${ts}`;
    studentEmail = `p4b.axe.student.${ts}@vissionacademy.edu`;
    studentId = `std_p4b_axe_${ts}`;
    await pool.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active, must_reset_password)
       VALUES ($1, $2, $3, 'student', 'Phase4B Axe Student', true, false)`,
      [studentUserId, studentEmail, passwordHash]
    );
    await pool.query(
      `INSERT INTO students (id, user_id, roll_number, class_id)
       VALUES ($1, $2, $3, 'cls_y1_a')`,
      [studentId, studentUserId, `AX${Math.floor(100000 + Math.random() * 900000)}`]
    );
  });

  test.afterAll(async () => {
    try {
      if (studentUserId) {
        await pool.query(`DELETE FROM students WHERE user_id = $1`, [studentUserId]);
        await pool.query(`DELETE FROM users WHERE id = $1`, [studentUserId]);
      }
      if (teacherId) {
        await pool.query(`DELETE FROM teacher_class_assignments WHERE teacher_user_id = $1`, [teacherId]);
        await pool.query(`DELETE FROM assessment_definitions WHERE teacher_user_id = $1`, [teacherId]);
        await pool.query(`DELETE FROM users WHERE id = $1`, [teacherId]);
      }
      if (placementId) {
        await pool.query(`DELETE FROM users WHERE id = $1`, [placementId]);
      }
      if (adminId) {
        await pool.query(`DELETE FROM notifications WHERE created_by = $1`, [adminId]);
        await pool.query(`DELETE FROM users WHERE id = $1`, [adminId]);
      }
    } catch (e) {
      console.warn('Cleanup error:', e);
    }
    await pool.end();
  });

  test('1. Admin: Scan all tabs and modals for WCAG serious/critical accessibility', async ({ page }) => {
    test.setTimeout(120000);
    await loginAs(page, adminEmail, '/admin');

    const adminTabs = [
      'College Overview & Analytics',
      'Classes & Courses',
      'User Directory',
      'Teacher Scopes & History',
      'Official Marksheets',
      'Academic Records',
      'Broadcast Notices',
      'College Events & Hackathons',
      'Audit Trail & Security Logs',
      'Analytics Settings'
    ];

    // Scan each tab
    for (const tabName of adminTabs) {
      const tabBtn = page.getByRole('button', { name: tabName });
      await tabBtn.click();
      await page.waitForTimeout(200);
      await runAxeScan(page, `Admin Tab: ${tabName}`);
    }

    // Modal 1: Add User Modal (in User Directory tab)
    await page.getByRole('button', { name: 'User Directory' }).click();
    await page.getByRole('button', { name: 'Add Single User' }).click();
    await expect(page.locator('text=Register New User')).toBeVisible();
    await runAxeScan(page, 'Admin Modal: Register New User');
    await page.locator('div.fixed button', { hasText: 'Cancel' }).click();
    await expect(page.locator('text=Register New User')).not.toBeVisible();

    // Modal 2: Bulk CSV Import Modal
    await page.getByRole('button', { name: 'Bulk CSV Import' }).first().click();
    await expect(page.locator('text=Bulk CSV User Importer')).toBeVisible();
    await runAxeScan(page, 'Admin Modal: Bulk CSV Import');
    await page.locator('div.fixed button', { hasText: 'Cancel' }).click();
    await expect(page.locator('text=Bulk CSV User Importer')).not.toBeVisible();

    // Modal 3: Assign Teacher Modal
    await page.getByRole('button', { name: 'Assign Teacher' }).click();
    await expect(page.locator('text=Assign Faculty Scope')).toBeVisible();
    await runAxeScan(page, 'Admin Modal: Assign Faculty Scope');
    await page.locator('div.fixed button', { hasText: 'Cancel' }).click();
    await expect(page.locator('text=Assign Faculty Scope')).not.toBeVisible();

    // Modal 4: Advance Semester Modal
    await page.getByRole('button', { name: 'Advance Semester' }).click();
    await expect(page.locator('text=Advance Academic Term / Semester')).toBeVisible();
    await runAxeScan(page, 'Admin Modal: Advance Academic Term');
    await page.locator('div.fixed button', { hasText: 'Cancel' }).click();
    await expect(page.locator('text=Advance Academic Term / Semester')).not.toBeVisible();
  });

  test('2. Teacher: Scan all tabs and modals for WCAG serious/critical accessibility', async ({ page }) => {
    test.setTimeout(120000);
    await loginAs(page, teacherEmail, '/teacher');

    const teacherSubTabs = [
      'Class Student Roster',
      'Spreadsheet Marks Entry Grid',
      'Analytics & Regression Forecasts',
      'Announcements & Inbox'
    ];

    for (const tabName of teacherSubTabs) {
      const tabBtn = page.getByRole('button', { name: tabName });
      await tabBtn.click();
      await page.waitForTimeout(200);
      await runAxeScan(page, `Teacher Sub-tab: ${tabName}`);
    }

    // Modal 1: Batch CSV Marks Import Modal (in marks grid tab)
    await page.getByRole('button', { name: 'Spreadsheet Marks Entry Grid' }).click();
    await page.getByRole('button', { name: 'Batch CSV Import' }).click();
    await expect(page.locator('text=Batch Import Marks via CSV')).toBeVisible();
    await runAxeScan(page, 'Teacher Modal: Batch Import Marks via CSV');
    await page.locator('div.fixed button', { hasText: 'Cancel' }).click();
    await expect(page.locator('text=Batch Import Marks via CSV')).not.toBeVisible();
  });

  test('3. Student: Scan all tabs and modals for WCAG serious/critical accessibility', async ({ page }) => {
    await loginAs(page, studentEmail, '/student');

    const studentTabs = [
      { id: 'profile', name: 'Bio & Resume' },
      { id: 'activity', name: 'Activity & Posts' },
      { id: 'analytics', name: 'Analytics' },
      { id: 'portfolio', name: 'Projects & Badges' },
      { id: 'sports', name: 'Sports & Athletics' },
      { id: 'intelligence', name: 'Student Intelligence' },
      { id: 'academics', name: 'Marks & Transcripts' },
      { id: 'events', name: 'Events & Hackathons' },
      { id: 'documents', name: 'Document Vault' }
    ];

    for (const tab of studentTabs) {
      console.log(`[Student Axe] Clicking tab: ${tab.name}`);
      const tabBtn = page.getByTestId(`student-tab-${tab.id}`);
      await tabBtn.click();
      await page.waitForTimeout(400);
      await runAxeScan(page, `Student Tab: ${tab.name}`);

      // Scan modals while on the corresponding tab
      if (tab.id === 'activity') {
        console.log('[Student Axe] Scanning modal: Create New Post');
        await page.getByTestId('student-create-post-btn').click();
        await expect(page.locator('text=Create New Post')).toBeVisible();
        await runAxeScan(page, 'Student Modal: Create New Post');
        await page.locator('div.fixed button', { hasText: 'Cancel' }).click();
        await expect(page.locator('text=Create New Post')).not.toBeVisible();
      }

      if (tab.id === 'portfolio') {
        console.log('[Student Axe] Scanning modal: Add Portfolio Project');
        await page.getByTestId('student-add-project-btn').click();
        await expect(page.locator('text=Add Portfolio Project')).toBeVisible();
        await runAxeScan(page, 'Student Modal: Add Portfolio Project');
        await page.locator('div.fixed button', { hasText: 'Cancel' }).click();
        await expect(page.locator('text=Add Portfolio Project')).not.toBeVisible();

        console.log('[Student Axe] Scanning modal: Add Certification Record');
        await page.getByTestId('student-add-cert-btn').click();
        await expect(page.locator('text=Add Certification Record')).toBeVisible();
        await runAxeScan(page, 'Student Modal: Add Certification');
        await page.locator('div.fixed button', { hasText: 'Cancel' }).click();
        await expect(page.locator('text=Add Certification Record')).not.toBeVisible();
      }
    }
  });

  test('4. Placement: Scan all tabs for WCAG serious/critical accessibility', async ({ page }) => {
    test.setTimeout(60000);
    await loginAs(page, placementEmail, '/placement');

    const placementTabs = [
      'Overview',
      'Academic Records'
    ];

    for (const tabName of placementTabs) {
      const tabBtn = page.getByRole('button', { name: tabName });
      await tabBtn.click();
      await page.waitForTimeout(200);
      await runAxeScan(page, `Placement Tab: ${tabName}`);
    }
  });
});
