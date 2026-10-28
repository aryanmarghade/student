import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.demo'), override: true });

const DEMO_URL = 'http://127.0.0.1:3001';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'DemoPassSecure2026!';
const QA_EVIDENCE_DIR = path.resolve(process.cwd(), 'reports/qa-evidence');

export interface AuditResult {
  role: string;
  item: string;
  type: 'tab' | 'modal';
  viewport: string;
  durationMs: number;
  flagOver2s: boolean;
  consoleErrors: string[];
  failedRequests: string[];
  textAnomalies: string[];
  hasHorizontalOverflow: boolean;
  screenshotFile: string;
  verdict: 'PASS' | 'WARN' | 'FAIL';
}

test.describe('Part B: Tabs, Modals, Viewports & Text Scanning QA', () => {
  const auditLedger: AuditResult[] = [];

  test.beforeAll(() => {
    if (!fs.existsSync(QA_EVIDENCE_DIR)) {
      fs.mkdirSync(QA_EVIDENCE_DIR, { recursive: true });
    }
  });

  test.afterAll(() => {
    const outPath = path.join(QA_EVIDENCE_DIR, 'partB_results.json');
    fs.writeFileSync(outPath, JSON.stringify(auditLedger, null, 2), 'utf-8');
    console.log(`[Part B Audit Ledger saved]: ${outPath} (${auditLedger.length} items recorded)`);
  });

  const viewports = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'mobile', width: 375, height: 667 },
  ];

  // Helper function to inspect page state
  async function auditCurrentView(
    page: any,
    role: string,
    item: string,
    type: 'tab' | 'modal',
    vpName: string,
    durationMs: number,
    consoleErrors: string[],
    failedRequests: string[]
  ): Promise<AuditResult> {
    const textContent = await page.evaluate(() => document.body.innerText || '');
    const anomalyRegex = /\b(NaN|undefined|null|Infinity|\[object Object\])\b/g;
    const matches: string[] = Array.from(new Set(textContent.match(anomalyRegex) || []));
    // Filter out legitimate words in texts
    const filteredMatches: string[] = matches.filter(m => {
      // If "null" appears in explanatory prose, check context
      return true;
    });

    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 5;
    });

    const flagOver2s = durationMs > 2000;
    const sanitizedName = `partB_${role}_${item.replace(/[^a-zA-Z0-9]/g, '_')}_${vpName}.png`;
    const shotPath = path.join(QA_EVIDENCE_DIR, sanitizedName);
    await page.screenshot({ path: shotPath, fullPage: false });

    let verdict: 'PASS' | 'WARN' | 'FAIL' = 'PASS';
    if (consoleErrors.length > 0 || failedRequests.length > 0) {
      verdict = 'FAIL';
    } else if (flagOver2s || filteredMatches.length > 0 || (hasHorizontalOverflow && vpName === 'desktop')) {
      verdict = 'WARN';
    }

    const rec: AuditResult = {
      role,
      item,
      type,
      viewport: vpName,
      durationMs,
      flagOver2s,
      consoleErrors: [...consoleErrors],
      failedRequests: [...failedRequests],
      textAnomalies: filteredMatches,
      hasHorizontalOverflow,
      screenshotFile: sanitizedName,
      verdict,
    };
    auditLedger.push(rec);
    return rec;
  }

  // 1. ADMIN AUDIT
  test('B1. Admin - Audit all 10 tabs and modals across viewports', async ({ page }) => {
    test.setTimeout(180000);
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('requestfailed', req => {
      failedRequests.push(`${req.method()} ${req.url()}: ${req.failure()?.errorText}`);
    });
    page.on('response', res => {
      if (res.status() >= 400 && !res.url().includes('/api/auth/me')) {
        failedRequests.push(`${res.status()} ${res.url()}`);
      }
    });

    await page.route('**/api/**', async route => {
      const headers = { ...route.request().headers(), 'x-bypass-ratelimit': 'qa-stress-suite' };
      await route.continue({ headers });
    });

    // Login as Admin
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${DEMO_URL}/#login`);
    await page.fill('input[type="email"]', 'demo_admin@vissionacademy.edu');
    await page.fill('input[type="password"]', DEMO_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Institutional Administration').first()).toBeVisible({ timeout: 15000 });

    const adminTabs = [
      { name: 'Overview', selector: 'button:has-text("College Overview & Analytics")' },
      { name: 'Classes & Courses', selector: 'button:has-text("Classes & Courses")' },
      { name: 'User Directory', selector: 'button:has-text("User Directory")' },
      { name: 'Teacher Scopes', selector: 'button:has-text("Teacher Scopes & History")' },
      { name: 'Official Marksheets', selector: 'button:has-text("Official Marksheets")' },
      { name: 'Academic Records', selector: 'button:has-text("Academic Records")' },
      { name: 'Broadcast Notices', selector: 'button:has-text("Broadcast Notices")' },
      { name: 'College Events', selector: 'button:has-text("College Events & Hackathons")' },
      { name: 'Audit Trail', selector: 'button:has-text("Audit Trail & Security Logs")' },
      { name: 'Analytics Settings', selector: 'button:has-text("Analytics Settings")' },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(500);

      for (const t of adminTabs) {
        consoleErrors.length = 0;
        failedRequests.length = 0;

        const btn = page.locator(t.selector).first();
        if (await btn.isVisible()) {
          const t0 = Date.now();
          await btn.click();
          await page.waitForTimeout(600);
          const duration = Date.now() - t0;
          await auditCurrentView(page, 'admin', t.name, 'tab', vp.name, duration, consoleErrors, failedRequests);
        }
      }

      // Test Modals on Desktop & Mobile
      if (vp.name === 'desktop') {
        // Modal: Bulk CSV Import
        const bulkBtn = page.locator('button:has-text("Bulk CSV Import")').first();
        if (await bulkBtn.isVisible()) {
          consoleErrors.length = 0;
          failedRequests.length = 0;
          const t0 = Date.now();
          await bulkBtn.click();
          await page.waitForTimeout(600);
          await auditCurrentView(page, 'admin', 'Modal_Bulk_CSV_Import', 'modal', vp.name, Date.now() - t0, consoleErrors, failedRequests);
          const closeBtn = page.locator('button:has-text("Cancel"), button:has-text("✕")').first();
          if (await closeBtn.isVisible()) await closeBtn.click();
        }

        // Modal: Assign Teacher
        const assignBtn = page.locator('button:has-text("Assign Teacher")').first();
        if (await assignBtn.isVisible()) {
          consoleErrors.length = 0;
          failedRequests.length = 0;
          const t0 = Date.now();
          await assignBtn.click();
          await page.waitForTimeout(600);
          await auditCurrentView(page, 'admin', 'Modal_Assign_Teacher', 'modal', vp.name, Date.now() - t0, consoleErrors, failedRequests);
          const closeBtn = page.locator('button:has-text("Cancel"), button:has-text("✕")').first();
          if (await closeBtn.isVisible()) await closeBtn.click();
        }

        // Modal: Student Dossier
        const recordsBtn = page.locator('button:has-text("Academic Records")').first();
        if (await recordsBtn.isVisible()) {
          await recordsBtn.click();
          await page.waitForTimeout(600);
          const dossierBtn = page.locator('button:has-text("View Dossier")').first();
          if (await dossierBtn.isVisible()) {
            consoleErrors.length = 0;
            failedRequests.length = 0;
            const t0 = Date.now();
            await dossierBtn.click();
            await page.waitForTimeout(1000);
            await auditCurrentView(page, 'admin', 'Modal_Student_Dossier', 'modal', vp.name, Date.now() - t0, consoleErrors, failedRequests);
            const closeBtn = page.locator('button:has-text("Close"), button:has-text("✕")').first();
            if (await closeBtn.isVisible()) await closeBtn.click();
          }
        }
      }
    }
  });

  // 2. TEACHER AUDIT
  test('B2. Teacher - Audit tabs and modals across viewports', async ({ page }) => {
    test.setTimeout(180000);
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('requestfailed', req => {
      failedRequests.push(`${req.method()} ${req.url()}: ${req.failure()?.errorText}`);
    });
    page.on('response', res => {
      if (res.status() >= 400 && !res.url().includes('/api/auth/me')) {
        failedRequests.push(`${res.status()} ${res.url()}`);
      }
    });

    await page.route('**/api/**', async route => {
      const headers = { ...route.request().headers(), 'x-bypass-ratelimit': 'qa-stress-suite' };
      await route.continue({ headers });
    });

    // Login as Teacher
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${DEMO_URL}/#login`);
    await page.fill('input[type="email"]', 'demo_teacher1@vissionacademy.edu');
    await page.fill('input[type="password"]', DEMO_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Faculty Class Workspace').first()).toBeVisible({ timeout: 15000 });

    // Select first assignment card
    const firstAssignment = page.locator('button:has-text("CSE Year 1 Section A")').or(page.locator('div[role="button"]')).first();
    if (await firstAssignment.isVisible()) {
      await firstAssignment.click();
      await page.waitForTimeout(600);
    }

    const teacherTabs = [
      { name: 'Class Student Roster', selector: 'button:has-text("Class Student Roster")' },
      { name: 'Marks Ledger', selector: 'button:has-text("Marks Ledger")' },
      { name: 'Class Analytics', selector: 'button:has-text("Class Analytics")' },
      { name: 'Notices & Circulars', selector: 'button:has-text("Notices & Circulars")' },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(500);

      for (const t of teacherTabs) {
        consoleErrors.length = 0;
        failedRequests.length = 0;

        const btn = page.locator(t.selector).first();
        if (await btn.isVisible()) {
          const t0 = Date.now();
          await btn.click();
          await page.waitForTimeout(600);
          const duration = Date.now() - t0;
          await auditCurrentView(page, 'teacher', t.name, 'tab', vp.name, duration, consoleErrors, failedRequests);
        }
      }

      if (vp.name === 'desktop') {
        // Modal: Student Analytics Dossier
        const rosterBtn = page.locator('button:has-text("Class Student Roster")').first();
        if (await rosterBtn.isVisible()) {
          await rosterBtn.click();
          await page.waitForTimeout(600);
          const analyticsBtn = page.locator('button:has-text("Analytics")').first();
          if (await analyticsBtn.isVisible()) {
            consoleErrors.length = 0;
            failedRequests.length = 0;
            const t0 = Date.now();
            await analyticsBtn.click();
            await page.waitForTimeout(1000);
            await auditCurrentView(page, 'teacher', 'Modal_Student_Analytics_Dossier', 'modal', vp.name, Date.now() - t0, consoleErrors, failedRequests);
            const closeBtn = page.locator('button:has-text("Close Dossier"), button:has-text("✕")').first();
            if (await closeBtn.isVisible()) await closeBtn.click();
          }
        }
      }
    }
  });

  // 3. PLACEMENT AUDIT
  test('B3. Placement - Audit tabs and modals across viewports', async ({ page }) => {
    test.setTimeout(180000);
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('requestfailed', req => {
      failedRequests.push(`${req.method()} ${req.url()}: ${req.failure()?.errorText}`);
    });
    page.on('response', res => {
      if (res.status() >= 400 && !res.url().includes('/api/auth/me')) {
        failedRequests.push(`${res.status()} ${res.url()}`);
      }
    });

    await page.route('**/api/**', async route => {
      const headers = { ...route.request().headers(), 'x-bypass-ratelimit': 'qa-stress-suite' };
      await route.continue({ headers });
    });

    // Login as Placement Officer
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${DEMO_URL}/#login`);
    await page.fill('input[type="email"]', 'demo_placement@vissionacademy.edu');
    await page.fill('input[type="password"]', DEMO_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Placement Office Dashboard').first()).toBeVisible({ timeout: 15000 });

    const placementTabs = [
      { name: 'Placement Overview', selector: 'button:has-text("Overview")' },
      { name: 'Academic Records', selector: 'button:has-text("Academic Records")' },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(500);

      for (const t of placementTabs) {
        consoleErrors.length = 0;
        failedRequests.length = 0;

        const btn = page.locator(t.selector).first();
        if (await btn.isVisible()) {
          const t0 = Date.now();
          await btn.click();
          await page.waitForTimeout(600);
          const duration = Date.now() - t0;
          await auditCurrentView(page, 'placement', t.name, 'tab', vp.name, duration, consoleErrors, failedRequests);
        }
      }

      if (vp.name === 'desktop') {
        // Modal: Student Profile Dossier with Role Evaluation
        const recordsBtn = page.locator('button:has-text("Academic Records")').first();
        if (await recordsBtn.isVisible()) {
          await recordsBtn.click();
          await page.waitForTimeout(600);
          const viewProfileBtn = page.locator('button:has-text("View Profile")').first();
          if (await viewProfileBtn.isVisible()) {
            consoleErrors.length = 0;
            failedRequests.length = 0;
            const t0 = Date.now();
            await viewProfileBtn.click();
            await page.waitForTimeout(1000);
            await auditCurrentView(page, 'placement', 'Modal_Candidate_Dossier', 'modal', vp.name, Date.now() - t0, consoleErrors, failedRequests);
            const closeBtn = page.locator('button:has-text("Close Profile"), button:has-text("✕")').first();
            if (await closeBtn.isVisible()) await closeBtn.click();
          }
        }
      }
    }
  });

  // 4. STUDENT AUDIT
  test('B4. Student - Audit tabs and modals across viewports', async ({ page }) => {
    test.setTimeout(180000);
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('requestfailed', req => {
      failedRequests.push(`${req.method()} ${req.url()}: ${req.failure()?.errorText}`);
    });
    page.on('response', res => {
      if (res.status() >= 400 && !res.url().includes('/api/auth/me')) {
        failedRequests.push(`${res.status()} ${res.url()}`);
      }
    });

    await page.route('**/api/**', async route => {
      const headers = { ...route.request().headers(), 'x-bypass-ratelimit': 'qa-stress-suite' };
      await route.continue({ headers });
    });

    // Login as Student
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${DEMO_URL}/#login`);
    await page.fill('input[type="email"]', 'demo_student_top@vissionacademy.edu');
    await page.fill('input[type="password"]', DEMO_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Academic Information').first()).toBeVisible({ timeout: 15000 });

    const studentTabs = [
      { name: 'Profile', selector: 'button:has-text("Profile")' },
      { name: 'Activity Feed', selector: 'button:has-text("Activity")' },
      { name: 'Analytics', selector: 'button:has-text("Analytics")' },
      { name: 'Portfolio', selector: 'button:has-text("Portfolio")' },
      { name: 'Sports', selector: 'button:has-text("Sports")' },
      { name: 'Intelligence', selector: 'button:has-text("Intelligence")' },
      { name: 'Academics', selector: 'button:has-text("Academics")' },
      { name: 'Events', selector: 'button:has-text("Events")' },
      { name: 'Documents', selector: 'button:has-text("Documents")' },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(500);

      for (const t of studentTabs) {
        consoleErrors.length = 0;
        failedRequests.length = 0;

        const btn = page.locator(t.selector).first();
        if (await btn.isVisible()) {
          const t0 = Date.now();
          await btn.click();
          await page.waitForTimeout(600);
          const duration = Date.now() - t0;
          await auditCurrentView(page, 'student', t.name, 'tab', vp.name, duration, consoleErrors, failedRequests);
        }
      }
    }
  });
});
