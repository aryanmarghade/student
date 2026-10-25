import { test, expect } from '@playwright/test';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const BASE_URL = 'http://127.0.0.1:3000';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function loginAs(page: any, user: { email: string; pass: string }, targetPath: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.pass);
  await page.click('button[type="submit"]');
  await page.waitForURL((url: URL) => !url.pathname.includes('/login'), { timeout: 15000 });
  if (targetPath && !page.url().endsWith(targetPath)) {
    await page.goto(`${BASE_URL}${targetPath}`);
  }
  await page.waitForLoadState('networkidle');
}

test.describe('Phase 4B: Form Submissions Across All Roles', () => {
  let adminUser: { email: string; pass: string; id: string };
  let teacherUser: { email: string; pass: string; id: string };
  let studentUser: { email: string; pass: string; id: string; studentId: string };
  let resetPasswordUser: { email: string; pass: string; id: string };
  const createdUserIds: string[] = [];

  test.beforeAll(async () => {
    const password = 'RolePassword123!';
    const passwordHash = await bcrypt.hash(password, 10);

    // Admin
    const adminEmail = `phase4b.form.admin.${Date.now()}@vissionacademy.edu`;
    const adminId = `usr_p4b_form_adm_${Date.now()}`;
    await pool.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active, must_reset_password)
       VALUES ($1, $2, $3, 'admin', 'Phase4B Form Admin', true, false)`,
      [adminId, adminEmail, passwordHash]
    );
    adminUser = { email: adminEmail, pass: password, id: adminId };

    // Teacher with active assignment
    const teacherEmail = `phase4b.form.teacher.${Date.now()}@vissionacademy.edu`;
    const teacherId = `usr_p4b_form_tch_${Date.now()}`;
    await pool.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active, must_reset_password)
       VALUES ($1, $2, $3, 'teacher', 'Phase4B Form Teacher', true, false)`,
      [teacherId, teacherEmail, passwordHash]
    );
    await pool.query(
      `INSERT INTO teacher_class_assignments (id, teacher_user_id, class_id, subject_id, semester_id, status)
       VALUES ($1, $2, 'cls_y1_a', 'sbj_math1', 'sem_1', 'active') ON CONFLICT DO NOTHING`,
      [`tca_p4b_form_${Date.now()}`, teacherId]
    );
    teacherUser = { email: teacherEmail, pass: password, id: teacherId };

    // Student
    const studentEmail = `phase4b.form.student.${Date.now()}@vissionacademy.edu`;
    const studentUserId = `usr_p4b_form_std_${Date.now()}`;
    const studentId = `std_p4b_form_${Date.now()}`;
    await pool.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active, must_reset_password)
       VALUES ($1, $2, $3, 'student', 'Phase4B Form Student', true, false)`,
      [studentUserId, studentEmail, passwordHash]
    );
    await pool.query(
      `INSERT INTO students (id, user_id, roll_number, class_id)
       VALUES ($1, $2, $3, 'cls_y1_a')`,
      [studentId, studentUserId, `FS${Math.floor(100000 + Math.random() * 900000)}`]
    );
    studentUser = { email: studentEmail, pass: password, id: studentUserId, studentId };

    // Reset Password Candidate User
    const resetEmail = `phase4b.form.reset.${Date.now()}@vissionacademy.edu`;
    const resetUserId = `usr_p4b_form_rst_${Date.now()}`;
    await pool.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active, must_reset_password)
       VALUES ($1, $2, $3, 'student', 'Phase4B Must Reset User', true, true)`,
      [resetUserId, resetEmail, passwordHash]
    );
    await pool.query(
      `INSERT INTO students (id, user_id, roll_number, class_id)
       VALUES ($1, $2, $3, 'cls_y1_a')`,
      [`std_p4b_rst_${Date.now()}`, resetUserId, `FR${Math.floor(100000 + Math.random() * 900000)}`]
    );
    resetPasswordUser = { email: resetEmail, pass: password, id: resetUserId };
  });

  test.afterAll(async () => {
    try {
      for (const uid of createdUserIds) {
        await pool.query(`DELETE FROM students WHERE user_id = $1`, [uid]);
        await pool.query(`DELETE FROM users WHERE id = $1`, [uid]);
      }
      if (resetPasswordUser?.id) {
        await pool.query(`DELETE FROM students WHERE user_id = $1`, [resetPasswordUser.id]);
        await pool.query(`DELETE FROM users WHERE id = $1`, [resetPasswordUser.id]);
      }
      if (studentUser?.id) {
        await pool.query(`DELETE FROM posts WHERE student_id = $1`, [studentUser.studentId]);
        await pool.query(`DELETE FROM students WHERE user_id = $1`, [studentUser.id]);
        await pool.query(`DELETE FROM users WHERE id = $1`, [studentUser.id]);
      }
      if (teacherUser?.id) {
        await pool.query(`DELETE FROM teacher_class_assignments WHERE teacher_user_id = $1`, [teacherUser.id]);
        await pool.query(`DELETE FROM assessment_definitions WHERE teacher_user_id = $1`, [teacherUser.id]);
        await pool.query(`DELETE FROM users WHERE id = $1`, [teacherUser.id]);
      }
      if (adminUser?.id) {
        await pool.query(`DELETE FROM notifications WHERE created_by = $1`, [adminUser.id]);
        await pool.query(`DELETE FROM users WHERE id = $1`, [adminUser.id]);
      }
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

  test('1. Form Submit: Login Form submits successfully and navigates to role view', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', adminUser.email);
    await page.fill('input[type="password"]', adminUser.pass);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(`${BASE_URL}/admin`, { timeout: 15000 });
    await expect(page.locator('header')).toBeVisible();
  });

  test('2. Form Submit: Mandatory Password Setup Form submits and completes onboarding', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', resetPasswordUser.email);
    await page.fill('input[type="password"]', resetPasswordUser.pass);
    await page.click('button[type="submit"]');

    // Wait for mandatory setup modal
    await expect(page.locator('text=Mandatory Password Setup')).toBeVisible({ timeout: 10000 });
    await page.fill('input[placeholder="At least 8 characters"]', 'BrandNewSecurePassword123!');
    await page.fill('input[placeholder="Re-type new password"]', 'BrandNewSecurePassword123!');

    // Submit password setup
    const saveBtn = page.locator('button[type="submit"]', { hasText: 'Save & Enter Workspace' });
    await saveBtn.click();

    // Verify redirected to student workspace
    await expect(page).toHaveURL(`${BASE_URL}/student`, { timeout: 15000 });
    await expect(page.locator('header')).toBeVisible();
  });

  test('3. Form Submit: Admin Add User Form creates and persists a new faculty account', async ({ page }) => {
    await loginAs(page, adminUser, '/admin');

    // Click User Directory tab
    await page.locator('button', { hasText: 'User Directory' }).click();

    // Open Add User Modal
    const addUserBtn = page.locator('button', { hasText: 'Add Single User' });
    await expect(addUserBtn).toBeVisible({ timeout: 10000 });
    await addUserBtn.click();

    // Fill Create User Form in modal
    const modal = page.locator('div.fixed', { hasText: 'Register New User' });
    await expect(modal).toBeVisible();

    const newFacultyEmail = `faculty.p4b.${Date.now()}@vissionacademy.edu`;
    await modal.locator('input[type="text"]').first().fill('Dr. Form Test Faculty');
    await modal.locator('input[type="email"]').fill(newFacultyEmail);
    await modal.locator('select').first().selectOption('teacher');
    await modal.locator('input[type="text"]').nth(1).fill('TestPass123!');

    // Submit form
    const submitBtn = modal.locator('button[type="submit"]', { hasText: 'Create Account' });
    await submitBtn.click();

    // Verify toast & created user in directory
    await expect(page.locator(`text=${newFacultyEmail}`)).toBeVisible({ timeout: 15000 });

    // Track for cleanup
    const userRes = await pool.query(`SELECT id FROM users WHERE email = $1`, [newFacultyEmail]);
    if (userRes.rows[0]) createdUserIds.push(userRes.rows[0].id);
  });

  test('4. Form Submit: Admin Broadcast Notice Form publishes institutional announcement', async ({ page }) => {
    await loginAs(page, adminUser, '/admin');

    // Click Broadcast Notices tab
    await page.locator('button', { hasText: 'Broadcast Notices' }).click();

    // Fill Broadcast Notice Form
    const noticeTitle = `Campus Advisory Notice ${Date.now()}`;
    await page.fill('input[placeholder="e.g. End-Semester Examination Registration Schedule"]', noticeTitle);
    await page.fill('textarea[placeholder="Details of the circular, deadlines, guidelines..."]', 'This is a verified test institutional broadcast circular.');

    // Submit form
    const publishBtn = page.locator('button[type="submit"]', { hasText: 'Publish Circular' });
    await publishBtn.click();

    // Verify confirmation toast
    await expect(page.locator('[role="status"]')).toBeVisible({ timeout: 10000 });
  });

  test('5. Form Submit: Student Edit Profile Form updates bio and links', async ({ page }) => {
    await loginAs(page, studentUser, '/student');

    // Bio textarea in Profile tab
    const bioTextarea = page.locator('textarea[placeholder="Brief overview of your academic specializations, career goals, and technical focus..."]');
    await expect(bioTextarea).toBeVisible({ timeout: 10000 });
    await bioTextarea.fill('Updated bio for automated form testing.');

    // Save profile form
    const saveBtn = page.locator('button[type="submit"]', { hasText: 'Save Profile Changes' });
    await saveBtn.click();

    // Verify confirmation toast
    await expect(page.locator('[role="status"]')).toBeVisible({ timeout: 10000 });
  });

  test('6. Form Submit: Student Create Post Form publishes a portfolio update', async ({ page }) => {
    await loginAs(page, studentUser, '/student');

    // Switch to Activity & Posts tab
    await page.locator('button', { hasText: 'Activity & Posts' }).click();

    // Click Create Post button to open modal
    const createPostBtn = page.locator('button', { hasText: 'Create Post' });
    await expect(createPostBtn).toBeVisible({ timeout: 10000 });
    await createPostBtn.click();

    // Fill Create Post modal form
    const modal = page.locator('div.fixed', { hasText: 'Create New Post' });
    await expect(modal).toBeVisible();

    const postTitle = `Automated Phase 4B Post Title ${Date.now()}`;
    await modal.locator('input[placeholder="Post Title (e.g. Won 1st Prize in Hackathon)"]').fill(postTitle);
    await modal.locator('textarea[placeholder="What do you want to talk about?"]').fill('This is verified test post content published via automated Playwright test.');

    // Submit Post
    const publishBtn = modal.locator('button[type="submit"]', { hasText: 'Publish Post' });
    await publishBtn.click();

    // Verify post title appears in feed
    await expect(page.locator(`text=${postTitle}`)).toBeVisible({ timeout: 10000 });
  });

  test('7. Form Submit: Teacher Add Assessment Form creates new assessment column', async ({ page }) => {
    await loginAs(page, teacherUser, '/teacher');

    // Go to Spreadsheet Marks Entry Grid
    await page.locator('button', { hasText: 'Spreadsheet Marks Entry Grid' }).click();

    // Fill Assessment Draft Form
    const assessmentTitle = `Quiz ${Math.floor(100 + Math.random() * 900)}`;
    const titleInput = page.locator('input[placeholder="CA 1, Quiz, Viva, Seminar..."]');
    await expect(titleInput).toBeVisible({ timeout: 10000 });
    await titleInput.fill(assessmentTitle);

    // Click Add Assessment
    const addAssessmentBtn = page.locator('button[type="submit"]', { hasText: 'Add Assessment' });
    await addAssessmentBtn.click();

    // Verify column added to grid header
    await expect(page.locator('thead').locator(`text=${assessmentTitle}`)).toBeVisible({ timeout: 10000 });
  });

  test('8. Form Submit: Student HackerRank Evidence endpoints return array and persist evidence', async ({ request }) => {
    // Authenticate via real login endpoint
    const loginRes = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: studentUser.email, password: studentUser.pass },
      headers: { 'x-bypass-ratelimit': 'qa-stress-suite' }
    });
    expect(loginRes.status()).toBe(200);
    const { token } = await loginRes.json();

    // Verify GET /api/student/hackerrank/evidence returns 200 and an array
    const getRes = await request.get(`${BASE_URL}/api/student/hackerrank/evidence`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    expect(getRes.status()).toBe(200);
    const getData = await getRes.json();
    expect(Array.isArray(getData)).toBe(true);

    // Now test submitting a new evidence item
    const postRes = await request.post(`${BASE_URL}/api/student/hackerrank/evidence`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: {
        badge_or_certificate_name: 'Python (5 Stars)',
        skill_domain: 'Python',
        evidence_type: 'badge',
        star_rating: 5,
        certificate_url: 'https://www.hackerrank.com/certificates/test-cert'
      }
    });

    expect(postRes.status()).toBe(201);
    const postData = await postRes.json();
    expect(postData.evidence).toBeDefined();
    expect(postData.evidence.badge_or_certificate_name).toBe('Python (5 Stars)');

    // Cleanup the evidence
    if (postData.evidence?.id) {
      const delRes = await request.delete(`${BASE_URL}/api/student/hackerrank/evidence/${postData.evidence.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      expect(delRes.status()).toBe(200);
    }
  });
});
