---
name: browser-qa
description: Use after building or changing any web UI to test it like a human user in the browser before saying it is done. Tests all 4 roles (admin, teacher, student, placement) across viewports, consoles, forms, and keyboard accessibility.
---

# Browser QA Protocol - Vission Academy

## Purpose & Mandate
Never declare any UI feature or fix complete without running genuine, end-to-end browser verification. Tests must be performed across all 4 user roles using active test accounts against the local development server.

## Tools
- **Playwright Test Runner**: Automated headless and headed browser scripts (`@playwright/test`).
- **Chrome DevTools MCP / Browser Subagent**: Interactive DOM inspection, live console logs, screenshots, and clicks.

## Role-by-Role Test Accounts
Perform verification under each role persona:
1. **System Administrator (`admin`)**: Accesses `AdminView.tsx` (KPIs, User management, Marksheet uploads, Faculty/Placement visibility toggles, Sync center).
2. **Faculty / Subject Teacher (`teacher`)**: Accesses `TeacherView.tsx` (Class rosters, spreadsheet marks entry, regression curves).
3. **Placement Officer (`placement`)**: Accesses `PlacementView.tsx` (Candidate search, multi-year filters, 0-backlog eligibility, student dossier modal).
4. **Verified Student (`student`)**: Accesses `StudentView.tsx` (Showcase profile, project portfolio, marks transcripts, document vault).

## Step-by-Step QA Protocol

### 1. Viewport Inspections
Capture full-screen visual screenshots at 3 canonical viewports for each role:
- `375px x 667px` (Mobile view): Check hamburger menus, table scrollbars, modal sizing, touch targets.
- `768px x 1024px` (Tablet view): Check multi-column collapse, header navigation, chart legends.
- `1440px x 900px` (Desktop dashboard view): Verify full dashboard geometry, alignment, and data density.
Check explicitly for: text clipping, horizontal page overflow, unreadable contrast, and broken images.

### 2. Console & Network Hygiene
- Monitor browser console: Zero unhandled JavaScript exceptions, React hydration errors, or missing key warnings.
- Monitor network tab: Zero `4xx` or `5xx` failed API calls. Verify payload responses contain expected visibility-filtered data.

### 3. Component & Form Stress Testing
- Click every navigation tab, sub-tab, filter dropdown, and action button.
- On every data entry form:
  - Submit completely empty form -> verify validation banners appear.
  - Submit invalid types (e.g. text in numeric marks field, malformed URLs).
  - Submit boundary strings (>500 characters, special characters `<script>`, `'`, `"`).

### 4. Keyboard Accessibility Pass
- Navigate the full page using only `Tab`, `Shift+Tab`, `Enter`, and `Space`.
- Verify focus rings are clearly visible on all actionable elements.
- Verify active modals close on `Escape` and focus returns to the invoking trigger.

## Artifacts & Reporting
Save all browser output to:
`reports/qa/<role>-<feature>-<date>.png`
`reports/qa/qa-checklist.md`

Output checklist format:
```markdown
- [x] Role Tested: [admin | teacher | student | placement]
- [x] Viewports: 375px (PASS) | 768px (PASS) | 1440px (PASS)
- [x] Console Errors: 0 detected
- [x] Network Failures: 0 detected
- [x] Form Validation: Empty/Invalid/Overflow handled
- [x] Keyboard Navigation: Full focus trap & tab traversal
```
Never claim "it works" without screenshot proof and checklist output.
