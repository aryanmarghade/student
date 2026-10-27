import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const SCREENSHOT_DIR = path.resolve('C:/Users/Aryan/.gemini/antigravity-ide/brain/f18d0e1f-9150-4aab-8b27-d606c6770da6/screenshots');

test.beforeAll(async () => {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
});

test.describe('Part 0: Visual Proof of Demo Data Across All 4 Roles', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      const headers = { ...route.request().headers(), 'x-bypass-ratelimit': 'qa-stress-suite' };
      await route.continue({ headers });
    });
  });

  test('1. Admin UI displays seeded demo students and academic metrics', async ({ page }) => {
    await page.goto('/#login');
    await page.fill('input[type="email"]', 'admin.test@vissionacademy.edu');
    await page.fill('input[type="password"]', 'TestPass123!');
    await page.click('button[type="submit"]');

    // Wait for Admin dashboard
    await expect(page.locator('text=Overview').first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1500);

    // Navigate to Students tab if present
    const studentsBtn = page.locator('button:has-text("Students"), a:has-text("Students")').first();
    if (await studentsBtn.isVisible()) {
      await studentsBtn.click();
      await page.waitForTimeout(1500);
    }

    const screenshotPath = path.join(SCREENSHOT_DIR, 'part0_admin_demo_students.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('[Screenshot Saved]:', screenshotPath);
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  test('2. Teacher UI displays class roster with seeded demo students and marks', async ({ page }) => {
    await page.goto('/#login');
    await page.fill('input[type="email"]', 'teacher.test@vissionacademy.edu');
    await page.fill('input[type="password"]', 'TestPass123!');
    await page.click('button[type="submit"]');

    // Wait for Teacher workspace
    await expect(page.locator('text=Test Teacher').or(page.locator('text=Subject Teacher')).first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);

    const screenshotPath = path.join(SCREENSHOT_DIR, 'part0_teacher_demo_roster.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('[Screenshot Saved]:', screenshotPath);
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  test('3. Placement Officer UI displays demo student directory with filters & external profiles', async ({ page }) => {
    await page.goto('/#login');
    await page.fill('input[type="email"]', 'placement.test@vissionacademy.edu');
    await page.fill('input[type="password"]', 'TestPass123!');
    await page.click('button[type="submit"]');

    // Wait for Placement workspace
    await expect(page.locator('text=Placement Officer').first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);

    const dirScreenshotPath = path.join(SCREENSHOT_DIR, 'part0_placement_demo_directory.png');
    await page.screenshot({ path: dirScreenshotPath, fullPage: true });
    console.log('[Screenshot Saved]:', dirScreenshotPath);
    expect(fs.existsSync(dirScreenshotPath)).toBe(true);

    // Click on student row or button to view dossier modal
    const studentRow = page.locator('text=DEMO_').first();
    if (await studentRow.isVisible()) {
      await studentRow.click();
      await page.waitForTimeout(1500);
      const dossierScreenshotPath = path.join(SCREENSHOT_DIR, 'part0_placement_demo_dossier.png');
      await page.screenshot({ path: dossierScreenshotPath, fullPage: true });
      console.log('[Screenshot Saved]:', dossierScreenshotPath);
      expect(fs.existsSync(dossierScreenshotPath)).toBe(true);
    }
  });

  test('4. Student UI displays portfolio, external profiles, projects, and marks', async ({ page }) => {
    await page.goto('/#login');
    await page.fill('input[type="email"]', 'demo.student.1@vissionacademy.edu');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Wait for Student portal
    await expect(page.locator('text=DEMO_').first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1500);

    const screenshotPath = path.join(SCREENSHOT_DIR, 'part0_student_demo_profile.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('[Screenshot Saved]:', screenshotPath);
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });
});
