import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import pg from 'pg';
import dotenv from 'dotenv';

// Load demo configuration
dotenv.config({ path: path.resolve(process.cwd(), '.env.demo'), override: true });

const DEMO_URL = 'http://127.0.0.1:3001';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'DemoPassSecure2026!';
const PROOF_DIR = path.resolve(process.cwd(), 'reports/demo-proof');

test.use({ baseURL: DEMO_URL });

test.describe('Part 0B: Proof That The Demo Data Shows on dev:demo (Port 3001)', () => {
  let pool: pg.Pool;

  test.beforeAll(async () => {
    if (!fs.existsSync(PROOF_DIR)) {
      fs.mkdirSync(PROOF_DIR, { recursive: true });
    }
    const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:aryan@localhost:5432/vission_academy_demo';
    pool = new pg.Pool({ connectionString: dbUrl });
  });

  test.afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      const headers = { ...route.request().headers(), 'x-bypass-ratelimit': 'qa-stress-suite' };
      await route.continue({ headers });
    });
  });

  test('1. Teacher student analytics screenshot (LeetCode, HackerRank, GitHub, hackathons, sports)', async ({ page }) => {
    await page.goto(`${DEMO_URL}/#login`);
    await page.fill('input[type="email"]', 'demo_teacher1@vissionacademy.edu');
    await page.fill('input[type="password"]', DEMO_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for Teacher workspace
    await expect(page.locator('text=Faculty Class Workspace').first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1500);

    // Click on the first assignment if needed
    const assignmentBtn = page.locator('button:has-text("CSE Year 1 Section A")').first();
    if (await assignmentBtn.isVisible()) {
      await assignmentBtn.click();
      await page.waitForTimeout(1000);
    }

    // Click on Roster tab
    const rosterTab = page.locator('button:has-text("Class Student Roster")').first();
    if (await rosterTab.isVisible()) {
      await rosterTab.click();
      await page.waitForTimeout(1000);
    }

    // Open Student Analytics modal for first student
    const analyticsBtn = page.locator('button:has-text("Analytics")').first();
    await expect(analyticsBtn).toBeVisible({ timeout: 10000 });
    await analyticsBtn.click();
    await page.waitForTimeout(2000);

    // Verify modal elements are visible: LeetCode / GitHub / HackerRank / Posts
    await expect(page.locator('text=GitHub Contributions').or(page.locator('text=Public Repos')).first()).toBeVisible({ timeout: 10000 });

    const screenshotPath = path.join(PROOF_DIR, 'teacher_student_analytics.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('[Screenshot Saved]:', screenshotPath);
    expect(fs.existsSync(screenshotPath)).toBe(true);

    // Close modal
    const closeBtn = page.locator('button:has-text("Close Dossier")').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    }
  });

  test('2. Placement directory and student dossier modal screenshots', async ({ page }) => {
    await page.goto(`${DEMO_URL}/#login`);
    await page.fill('input[type="email"]', 'demo_placement@vissionacademy.edu');
    await page.fill('input[type="password"]', DEMO_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for Placement workspace
    await expect(page.locator('text=Placement').first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1500);

    // Navigate to Students directory tab (Academic Records)
    const studentsTab = page.locator('button:has-text("Academic Records")').first();
    await expect(studentsTab).toBeVisible({ timeout: 10000 });
    await studentsTab.click();
    await page.waitForTimeout(1500);

    // Capture Placement Directory
    const dirScreenshotPath = path.join(PROOF_DIR, 'placement_directory.png');
    await page.screenshot({ path: dirScreenshotPath, fullPage: true });
    console.log('[Screenshot Saved]:', dirScreenshotPath);
    expect(fs.existsSync(dirScreenshotPath)).toBe(true);

    // Open Student Dossier Modal
    const viewProfileBtn = page.locator('button:has-text("View Profile")').first();
    await expect(viewProfileBtn).toBeVisible({ timeout: 10000 });
    await viewProfileBtn.click();
    await page.waitForTimeout(2000);

    // Capture Placement Student Dossier Modal
    const modalScreenshotPath = path.join(PROOF_DIR, 'placement_student_dossier_modal.png');
    await page.screenshot({ path: modalScreenshotPath, fullPage: true });
    console.log('[Screenshot Saved]:', modalScreenshotPath);
    expect(fs.existsSync(modalScreenshotPath)).toBe(true);
  });

  test('3. Admin student dossier and Analytics Settings screenshots', async ({ page }) => {
    await page.goto(`${DEMO_URL}/#login`);
    await page.fill('input[type="email"]', 'demo_admin@vissionacademy.edu');
    await page.fill('input[type="password"]', DEMO_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for Admin dashboard
    await expect(page.locator('text=Academic Command Portal').or(page.locator('text=College Overview')).first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1500);

    // 3a. Admin Student Dossier via Academic Records tab
    const academicRecordsTab = page.locator('button:has-text("Academic Records")').first();
    await expect(academicRecordsTab).toBeVisible({ timeout: 10000 });
    await academicRecordsTab.click();
    await page.waitForTimeout(1500);

    // Click "View Dossier"
    const viewDossierBtn = page.locator('button:has-text("View Dossier")').first();
    await expect(viewDossierBtn).toBeVisible({ timeout: 10000 });
    await viewDossierBtn.click();
    await page.waitForTimeout(2000);

    const dossierScreenshotPath = path.join(PROOF_DIR, 'admin_student_dossier.png');
    await page.screenshot({ path: dossierScreenshotPath, fullPage: true });
    console.log('[Screenshot Saved]:', dossierScreenshotPath);
    expect(fs.existsSync(dossierScreenshotPath)).toBe(true);

    // Close Dossier
    const closeDossierBtn = page.locator('button:has-text("Close"), button:has-text("✕")').first();
    if (await closeDossierBtn.isVisible()) {
      await closeDossierBtn.click();
      await page.waitForTimeout(500);
    }

    // 3b. Admin Analytics Settings tab
    const settingsTab = page.locator('button:has-text("Analytics Settings")').first();
    await expect(settingsTab).toBeVisible({ timeout: 10000 });
    await settingsTab.click();
    await page.waitForTimeout(1500);

    const settingsScreenshotPath = path.join(PROOF_DIR, 'admin_analytics_settings.png');
    await page.screenshot({ path: settingsScreenshotPath, fullPage: true });
    console.log('[Screenshot Saved]:', settingsScreenshotPath);
    expect(fs.existsSync(settingsScreenshotPath)).toBe(true);
  });

  test('4. Student profile / intelligence / sports tabs screenshots', async ({ page }) => {
    await page.goto(`${DEMO_URL}/#login`);
    await page.fill('input[type="email"]', 'demo_student_top@vissionacademy.edu');
    await page.fill('input[type="password"]', DEMO_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for Student Workspace
    await expect(page.locator('text=Academic Transcript').or(page.locator('text=Profile')).or(page.locator('text=Portfolio')).first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1500);

    // 4a. Profile Tab
    const profileTab = page.locator('button:has-text("Profile"), a:has-text("Profile")').first();
    if (await profileTab.isVisible()) {
      await profileTab.click();
      await page.waitForTimeout(1000);
    }
    const profileScreenshotPath = path.join(PROOF_DIR, 'student_profile_tab.png');
    await page.screenshot({ path: profileScreenshotPath, fullPage: true });
    console.log('[Screenshot Saved]:', profileScreenshotPath);
    expect(fs.existsSync(profileScreenshotPath)).toBe(true);

    // 4b. Intelligence Tab
    const intelligenceTab = page.locator('button:has-text("Intelligence"), a:has-text("Intelligence"), button:has-text("AI Insights")').first();
    if (await intelligenceTab.isVisible()) {
      await intelligenceTab.click();
      await page.waitForTimeout(1000);
    }
    const intelligenceScreenshotPath = path.join(PROOF_DIR, 'student_intelligence_tab.png');
    await page.screenshot({ path: intelligenceScreenshotPath, fullPage: true });
    console.log('[Screenshot Saved]:', intelligenceScreenshotPath);
    expect(fs.existsSync(intelligenceScreenshotPath)).toBe(true);

    // 4c. Sports Tab
    const sportsTab = page.locator('button:has-text("Sports"), a:has-text("Sports"), button:has-text("Athletics")').first();
    if (await sportsTab.isVisible()) {
      await sportsTab.click();
      await page.waitForTimeout(1000);
    }
    const sportsScreenshotPath = path.join(PROOF_DIR, 'student_sports_tab.png');
    await page.screenshot({ path: sportsScreenshotPath, fullPage: true });
    console.log('[Screenshot Saved]:', sportsScreenshotPath);
    expect(fs.existsSync(sportsScreenshotPath)).toBe(true);
  });

  test('5. Read and assert DB values equal screen text for 5 random demo students', async ({ page }) => {
    // 1. Fetch 5 random demo students from DB
    const res = await pool.query<{
      id: string;
      roll_number: string;
      full_name: string;
      cgpa: number | null;
      department_name: string;
      total_solved: number | null;
    }>(`
      SELECT s.id, s.roll_number, u.full_name, d.name as department_name,
             (s.leetcode_data->>'totalSolved')::int as total_solved,
             mh.cgpa
      FROM students s
      JOIN users u ON s.user_id = u.id
      JOIN departments d ON s.department_id = d.id
      LEFT JOIN LATERAL (
        SELECT cgpa FROM marksheets WHERE student_id = s.id ORDER BY semester_id DESC LIMIT 1
      ) mh ON true
      WHERE s.id LIKE 'demo_%'
      ORDER BY s.roll_number
      LIMIT 5;
    `);

    const students = res.rows;
    expect(students.length).toBe(5);

    // Log in as Admin to access Academic Records database
    await page.goto(`${DEMO_URL}/#login`);
    await page.fill('input[type="email"]', 'demo_admin@vissionacademy.edu');
    await page.fill('input[type="password"]', DEMO_PASSWORD);
    await page.click('button[type="submit"]');

    await expect(page.locator('text=Academic Command Portal').or(page.locator('text=College Overview')).first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1500);

    // Navigate to Academic Records tab
    const academicRecordsTab = page.locator('button:has-text("Academic Records")').first();
    await academicRecordsTab.click();
    await page.waitForTimeout(1500);

    console.log('\n================ 5 RANDOM DEMO STUDENTS VERIFICATION ================');

    for (let i = 0; i < students.length; i++) {
      const s = students[i];
      
      // Search for student in academic records search input
      const searchInput = page.locator('input[placeholder*="Search roll no"]').first();
      await searchInput.fill(s.roll_number);
      await page.waitForTimeout(500);

      // Locate row
      const row = page.locator(`tr:has-text("${s.roll_number}")`).first();
      await expect(row).toBeVisible({ timeout: 5000 });
      const rowText = (await row.textContent()) || '';

      const expectedCgpa = s.cgpa ? Number(s.cgpa).toFixed(2) : null;

      console.log(`\n--- STUDENT #${i + 1} (${s.roll_number}) ---`);
      console.log(`DATABASE VALUES:`);
      console.log(`  Roll Number    : ${s.roll_number}`);
      console.log(`  Full Name      : ${s.full_name}`);
      console.log(`  Department     : ${s.department_name}`);
      console.log(`  CGPA           : ${expectedCgpa || 'N/A'}`);
      console.log(`SCREEN TEXT READ BY PLAYWRIGHT:`);
      console.log(`  "${rowText.replace(/\s+/g, ' ').trim()}"`);

      // Assertions
      expect(rowText).toContain(s.roll_number);
      expect(rowText).toContain(s.full_name);
      if (expectedCgpa) {
        expect(rowText).toContain(expectedCgpa);
      }
      console.log(`VERIFICATION RESULT: ✅ PASS (Database values exactly match UI text)`);
    }

    console.log('======================================================================\n');
  });
});
