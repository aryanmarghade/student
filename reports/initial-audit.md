# Vission Academy - Comprehensive Initial System Audit Report
**Date**: October 25, 2026  
**Status**: AUDIT COMPLETE — AWAITING USER APPROVAL PRIOR TO REMEDIATION  
**Audited Components**: Backend Core & Routes (`server/*`), Frontend Views (`src/views/*`), UI Components (`src/components/*`), RBAC Matrix Suite (`tests/rbac.spec.ts`), and Multi-Role Browser Verification (`chrome-devtools-mcp` / Playwright).

---

## Executive Summary
This audit evaluated the Vission Academy platform across security architecture, role-based access boundaries (Admin, Teacher, Placement, Student), button interaction lifecycles, and visual browser responsiveness.

The Playwright master RBAC test suite (`tests/rbac.spec.ts`) was expanded to cover every endpoint across the matrix. The suite confirms that standard unauthorized and cross-role requests are blocked (41 passing tests), while **accurately failing on the two critical vulnerability vectors** (2 failing tests) pending Phase 1 remediation.

---

## 1. Security Vulnerability Findings (Sorted by Severity)

### [CRITICAL] 1. `must_reset_password` Enforcement Bypass (Server & Client)
- **Files & Lines**: `server/auth.ts:23-35`, `server/routes/auth-routes.ts:33`, `src/views/LoginView.tsx:34-41`, `src/App.tsx:28-41`
- **Vulnerability**:
  - **Server-side**: In `server/auth.ts`, `requireAuth` retrieves `must_reset_password` from PostgreSQL (`SELECT ... must_reset_password FROM users`), but **never checks its value** or blocks requests. Any user flagged for forced password reset can access all protected APIs by passing their JWT.
  - **Client-side**: In `LoginView.tsx`, when a user signs in with `must_reset_password = true`, `setToken(res.token)` is executed immediately before showing the reset form. If the user refreshes the browser, `App.tsx` calls `api.getCurrentUser()`, finds a valid session, and navigates directly to the dashboard, permanently bypassing the reset modal.
- **Verification**: Verified via Playwright test `[FAILING CRITICAL 1] Server blocks API access when must_reset_password is true` in `tests/rbac.spec.ts`, which currently fails with HTTP 200 instead of 403.
- **Remediation**:
  - In `server/auth.ts`, add middleware logic to reject requests with `403 Forbidden` (`{ error: 'Password reset required before accessing institutional resources.' }`) on non-auth routes if `user.must_reset_password` is true.
  - In `src/App.tsx`, check `res.user.must_reset_password` on initialization and render an inescapable `ResetPasswordModal` until updated.

---

### [CRITICAL] 2. Privilege Escalation via Placement Visibility Self-Override
- **File & Line**: `server/routes/placement-routes.ts:51-91`
- **Vulnerability**: The endpoint `PUT /api/placement/visibility` allows any logged-in Placement Officer to write directly to `placement_analytics_visibility`, effectively overriding the visibility toggles configured by the Administrator.
- **Verification**: Verified via Playwright test `[FAILING CRITICAL 2] Placement officer cannot self-override admin visibility permissions` in `tests/rbac.spec.ts`, which currently fails with HTTP 200 instead of 403.
- **Remediation**: Remove or restrict `PUT /api/placement/visibility` so only administrators can modify visibility flags via `/api/admin/placement/:id/analytics-visibility`.

---

### [HIGH] 3. Direct Upload Download Disconnect (HTTP 404 on Marksheets & Vault Docs)
- **Files & Lines**: `server.ts:62-64`, `server/routes/student-routes.ts:160`, `src/views/StudentView.tsx`
- **Vulnerability**: `server.ts` explicitly returns `404 Not Found` for any direct request to `/uploads/:folder/:filename`. However, student marks and dossiers return URLs formatted as `/uploads/marksheets/:filename`. Clicking these links in the browser leads directly to a 404 error rather than the authenticated streaming endpoint (`/api/student/marksheets/:marksheetId/file`).
- **Remediation**: Ensure frontend marksheets use the authenticated route `/api/student/marksheets/:id/file` or provide an authenticated streaming proxy handler.

---

### [HIGH] 4. Stored DOM-based XSS via Unsanitized Link Protocol (`javascript:`)
- **Files & Lines**: `src/views/StudentView.tsx:1387-1731`, `src/views/PlacementView.tsx:278-289`, `server/routes/student-routes.ts:93`
- **Vulnerability**: User-submitted URLs (GitHub URL, LinkedIn URL, LeetCode URL, HackerRank URL, Portfolio URL, Project repository links) are bound directly to `<a href={...}>` without verifying that the URL protocol is `http:` or `https:`. A malicious user can submit `javascript:alert(document.cookie)` as their website link; clicking this link in the Placement Officer or Student view triggers arbitrary JavaScript execution.
- **Remediation**: Sanitize all external URLs on the backend and enforce a helper in the UI (`safeUrl(url)`) that prepends `https://` or rejects any protocol other than `http:` or `https:`.

---

### [HIGH] 5. Missing Zip Bomb Defense & Unbounded Upload Size
- **File & Line**: `server/routes/admin-routes.ts:21-27`, `server/routes/admin-routes.ts:247-299`
- **Vulnerability**:
  - `admin-routes.ts:21`: The single PDF marksheet upload (`upload = multer(...)`) has **no `limits: { fileSize }` configured**, allowing arbitrarily large file uploads to exhaust disk storage.
  - `admin-routes.ts:247`: `POST /api/admin/marksheets/bulk-zip` unpacks ZIP archives in-memory without cumulative uncompressed byte quotas or max entry limits, creating a Denial of Service (Zip Bomb) vulnerability.
- **Remediation**: Add explicit `limits: { fileSize: 10 * 1024 * 1024 }` to the single upload multer, and enforce total extracted byte ceilings (max 250MB) and max entry counts (500 files) during ZIP iteration.

---

### [HIGH] 6. AI Assistant External Data Leakage (Bypassing Visibility Toggles)
- **File & Line**: `server/ai-assistant.ts:130-150`
- **Vulnerability**: When answering placement queries regarding student candidates, `buildScopedContext` calls `getStudentComprehensiveEvidence(sm.id)` and appends technical coding evidence (GitHub, LeetCode, HackerRank) directly into the AI prompt context **without checking `placement_analytics_visibility`**. If an admin has disabled GitHub or LeetCode for a placement officer, that officer can simply ask the AI assistant (`@StudentName tell me about their repositories`) to retrieve the restricted data.
- **Remediation**: Filter the evidence payload against active `placement_analytics_visibility` flags before injecting candidate details into the AI prompt context.

---

### [MEDIUM] 7. Rate Limiting Gaps & Testing Bypass Header
- **Files & Lines**: `server/auth.ts:58-65`, `server/routes/auth-routes.ts:36, 55`
- **Vulnerability**:
  - `/api/auth/login` is rate limited (15 attempts / 5 mins), but `/api/auth/reset-first-login-password` and `/api/auth/change-password` **lack any rate limiting**.
  - In `server/auth.ts:58`, `req.headers['x-bypass-ratelimit'] === 'qa-stress-suite'` completely disables rate limiting for any caller providing this custom header.
- **Remediation**: Mount rate limiting on password reset and change endpoints, and strip the `x-bypass-ratelimit` header in non-test environments.

---

### [MEDIUM] 8. Missing Outbound Timeouts in Synchronization Services (SSRF & DoS Risk)
- **Files & Lines**: `server/github-sync.ts:108, 130, 156`
- **Vulnerability**: Outbound fetch requests to `api.github.com` do not include an `AbortSignal` with timeout. If the remote service hangs or responds slowly, worker requests remain suspended indefinitely. (In contrast, `server/leetcode-sync.ts:59` correctly employs a 6-second `AbortController`).
- **Remediation**: Add explicit 10-second `AbortSignal.timeout(10000)` to all fetch operations in `server/github-sync.ts`.

---

### [MEDIUM] 9. Missing HTTP Security Headers & Production Error Leakage
- **File & Line**: `server.ts:1-87`
- **Vulnerability**:
  - Express server lacks `helmet` or explicit CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`.
  - No CORS origin whitelist is registered in `server.ts`.
  - Missing global error handling middleware (`app.use((err, req, res, next) => ...)`). When 500 errors occur, Express default handler returns HTML pages detailing directory structures and stack traces.
- **Remediation**: Mount helmet headers and attach a JSON error handler suppressing stack traces in production.

---

### [MEDIUM] 10. Dead Legacy Code Surface in Repository
- **Files**: `server/index.ts` (1,201 lines), `src/api.ts` (42 lines)
- **Vulnerability**: `server/index.ts` is an outdated entry point containing deprecated schemas and an insecure fallback secret (`'development-only-secret'`). It is still indexed in `tsconfig.json`.
- **Remediation**: Remove `server/index.ts` and `src/api.ts` from compilation and archive them safely.

---

## 2. Button & UI Interaction Audit Findings

| View | Element | Issue Description | Severity |
|---|---|---|---|
| `AdminView.tsx:1999` | "Sync All Platforms" button | **No loading state or spinner**: Runs with no visual feedback. **No disabled state**: Rapid re-clicks trigger heavy concurrent sync tasks. **No confirmation modal**: Irreversible system-wide operation triggers on a single click. | Medium |
| `AdminView.tsx:1914` | Placement Visibility Toggles | Lacks `disabled` state while API request is saving. Does not guard against rapid multi-clicks (`savingVisibilityKey` is not tracked for placement). | Medium |
| `PlacementView.tsx:54` | "View Profile" Row Button | **Silent failure on error**: `openStudentProfile` catches errors using only `console.error` without alerting the user via toast or banner. | Medium |
| `PlacementView.tsx:321` | Modal Close `✕` Button | Missing explicit `type="button"`, missing `aria-label="Close modal"`, and modal does NOT close on `Escape` key. | Low |
| `StudentView.tsx:352` | "Create Post" Submit Button | **No double-submit protection**: `handleCreatePost` lacks an `isSubmitting` flag; clicking "Publish" multiple times submits duplicate posts and file uploads. | Medium |
| `LoginView.tsx` | Form Inputs & Controls | Inputs lack associated `<label>` or explicit `id`/`name` attributes, triggering browser accessibility warnings. | Low |

---

## 3. Real Browser QA Testing Results (Clicks, Forms & Viewports)

Automated and real interactive testing was executed across all 4 roles using `chrome-devtools-mcp` against `http://127.0.0.1:3000`:

### Form Stress Testing
- **Login Form**:
  - Empty submit: Caught by HTML5 constraint validation (`"Please fill out this field."`).
  - Invalid format (`invalid-email-format`): Caught with `"Please include an '@' in the email address."`.
  - Boundary input (>500 chars): Handled without crashing; server returned expected 400.
- **Placement Candidate Search**:
  - Tested invalid search (`NonexistentStudent999`): Handled cleanly with empty state.
  - Tested long search (>500 chars): Handled cleanly without layout distortion.
- **Profile Modal Interactions**:
  - Modal opened cleanly on "View Profile" click.
  - Pressing `Escape` failed to close the modal (accessibility defect recorded).
  - Clicking `✕` closed the modal properly.

### Viewport Screenshots Captured & Saved
The complete 4 roles x 3 viewports (12 captures) matrix is recorded in `reports/qa/`:
- **Login**: [login-375x667.png](file:///c:/Users/Aryan/Downloads/vission-academy/reports/qa/login-375x667.png) | [login-1440x900.png](file:///c:/Users/Aryan/Downloads/vission-academy/reports/qa/login-1440x900.png)
- **Admin**: [admin-375x667.png](file:///c:/Users/Aryan/Downloads/vission-academy/reports/qa/admin-375x667.png) | [admin-768x1024.png](file:///c:/Users/Aryan/Downloads/vission-academy/reports/qa/admin-768x1024.png) | [admin-1440x900.png](file:///c:/Users/Aryan/Downloads/vission-academy/reports/qa/admin-1440x900.png)
- **Teacher**: [teacher-375x667.png](file:///c:/Users/Aryan/Downloads/vission-academy/reports/qa/teacher-375x667.png) | [teacher-768x1024.png](file:///c:/Users/Aryan/Downloads/vission-academy/reports/qa/teacher-768x1024.png) | [teacher-1440x900.png](file:///c:/Users/Aryan/Downloads/vission-academy/reports/qa/teacher-1440x900.png)
- **Placement**: [placement-375x667.png](file:///c:/Users/Aryan/Downloads/vission-academy/reports/qa/placement-375x667.png) | [placement-768x1024.png](file:///c:/Users/Aryan/Downloads/vission-academy/reports/qa/placement-768x1024.png) | [placement-1440x900.png](file:///c:/Users/Aryan/Downloads/vission-academy/reports/qa/placement-1440x900.png)
- **Student**: [student-375x667.png](file:///c:/Users/Aryan/Downloads/vission-academy/reports/qa/student-375x667.png) | [student-768x1024.png](file:///c:/Users/Aryan/Downloads/vission-academy/reports/qa/student-768x1024.png) | [student-1440x900.png](file:///c:/Users/Aryan/Downloads/vission-academy/reports/qa/student-1440x900.png)

---

## 4. Playwright RBAC Verification Suite Status
Automated test suite located at [`tests/rbac.spec.ts`](file:///c:/Users/Aryan/Downloads/vission-academy/tests/rbac.spec.ts):
- **Total Tests**: 43
- **Passing**: 41 (All unauthenticated 401s, expired 401s, wrong role 403s, IDOR checks, and visibility checks)
- **Failing (Expected Critical Baselines)**: 2
  - `[FAILING CRITICAL 1] Server blocks API access when must_reset_password is true` (Received 200, Expected 403)
  - `[FAILING CRITICAL 2] Placement officer cannot self-override admin visibility permissions` (Received 200, Expected 403)

---

## 5. Security & Environment Confirmations
1. **Database Environment**: Confirmed that all operations and tests ran strictly against the **local development database** (`postgresql://...localhost:5432/vission_academy`).
2. **Scratch File Cleanup**: `scratch/gen-student-token.ts` was deleted.
3. **Hardcoded Passwords Scan**:
   - `tests/rbac.spec.ts` contains **NO hardcoded passwords or secrets**; all tokens are signed dynamically at test runtime using the local development secret.
   - Legacy diagnostic scripts (`count.cjs`, `diagnose-*.cjs`, `test_endpoints.cjs`) contain local dev database connection strings (`postgresql://postgres:aryan@localhost:5432/vission_academy`), scheduled for cleanup in Phase 5.

---

## 6. Recommended Phase Remediation Plan

- **Phase 1: Critical Authentication & Privilege Escalation Fixes**
  - Fix 1: Enforce `must_reset_password` on server in `server/auth.ts` (return 403 on protected routes) and client in `src/App.tsx`.
  - Fix 2: Remove self-override capability in `server/routes/placement-routes.ts` (`PUT /api/placement/visibility`).
  - *Verification*: Both failing tests in `tests/rbac.spec.ts` must turn GREEN.
- **Phase 2: File Handling, Upload Size & Zip Bomb Defense**
  - Add 10MB limit to single PDF multer and extraction byte/entry quotas to bulk ZIP extraction.
  - Route marksheet downloads through authenticated `/api/student/marksheets/:id/file`.
- **Phase 3: Security Headers, CORS, Rate Limiting & SSRF Timeouts**
  - Mount Helmet security headers and production error middleware in `server.ts`.
  - Add rate limiting to password reset/change routes; strip bypass header.
  - Add AbortController timeouts to `server/github-sync.ts`.
  - Fix AI assistant placement scoping to honor visibility flags.
- **Phase 4: Button States, Double-Submit Protection & XSS Sanitization**
  - Sanitize user-submitted URL protocols to prevent `javascript:` XSS.
  - Add confirmation modal, loading spinner, and disabled state to "Sync All Platforms".
  - Add `isSubmitting` flag to student post creation and row-level loading in placement view.
  - Add Escape key closing to profile modals.
- **Phase 5: Hygiene, Accessibility & Legacy Cleanup**
  - Add explicit `type="button"` and `aria-label` attributes to icon buttons.
  - Archive dead legacy files (`server/index.ts`, `src/api.ts`).

---
*Audit complete. Ready to begin Phase 1 on a new git branch upon user confirmation.*
