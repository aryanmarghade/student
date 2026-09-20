# Analytics Visibility Endpoint Diagnosis

Generated: 2026-09-20

---

## Running Server

| Property | Value |
|---|---|
| **PID** | 19060 (parent: 10868) |
| **Port** | 3000 (TCP `0.0.0.0:3000`) |
| **Entry Point** | `server.ts` |
| **Launch Command** | `node --require .../tsx/dist/preflight.cjs --import file:///tsx/dist/loader.mjs server.ts` |
| **Execution** | `npm run dev` → `tsx server.ts` |

The process is **not** `server/index.ts`. The running server is `server.ts` at project root.

---

## Route Registration

| Property | Value |
|---|---|
| **Router file** | `server/routes/admin-routes.ts` |
| **Mount in `server.ts`** | Line 41: `app.use('/api/admin', adminRoutes)` |
| **Route declaration** | Line 362: `router.get('/analytics-visibility', ...)` |
| **Computed full path** | `/api/admin` + `/analytics-visibility` = `/api/admin/analytics-visibility` ✅ |
| **Auth middleware (router-level)** | Line 38: `router.use(requireAuth, requireRole('admin'))` |

The `analytics-visibility` routes are declared **after** GitHub sync routes (line 361–393), which is within the same Express router instance and behind the same router-level middleware. Route registration is correct.

---

## Middleware Chain

```
GET /api/admin/analytics-visibility
  │
  ├── server.ts: express.json() + urlencoded()
  ├── server.ts: app.use('/api/admin', adminRoutes) ← matches prefix
  │     │
  │     ├── admin-routes.ts L38: router.use(requireAuth, requireRole('admin'))
  │     │     ├── requireAuth → validates JWT, looks up user in DB
  │     │     └── requireRole('admin') → checks req.user.role === 'admin'
  │     │
  │     └── admin-routes.ts L362: router.get('/analytics-visibility', handler)
  │
  └── (Vite middleware — only reached if no route matched above)
```

**Auth middleware behavior:**
- Missing header → `401 { error: "Authentication required. Missing or malformed token." }`
- Invalid token → `401 { error: "Invalid or expired authentication token." }`
- Role ≠ `admin` → `403 { error: "Access forbidden: TEACHER role is not authorized..." }`
- Role = `admin` → passes through to handler

---

## Request Tests

### Unauthenticated (no Authorization header)

```
STATUS:       401
CONTENT-TYPE: application/json; charset=utf-8
RESULT:       {"error":"Authentication required. Missing or malformed token."}
```
→ Route **IS reached** (Express handler fires), returns JSON 401. Not HTML. Not 404.

### With real `role: teacher` JWT (browser default session)

```
STATUS:       403
CONTENT-TYPE: application/json; charset=utf-8
RESULT:       {"error":"Access forbidden: TEACHER role is not authorized for this resource."}
```
→ The endpoint returns **JSON 403**, not HTML. The `requireRole('admin')` middleware correctly rejects teacher tokens.

### With real `role: admin` JWT (generated from DB admin user)

```
STATUS:       200
CONTENT-TYPE: application/json; charset=utf-8
RESULT:       {
  "id": "global",
  "github_enabled": true,
  "hackathon_enabled": true,
  "linkedin_enabled": true,
  "academic_enabled": true,
  "updated_at": "2026-09-20T12:49:17.988Z"
}
```
→ **Full success**. All four required fields are present. Response is JSON.

---

## Database

**Table `analytics_visibility_settings` exists:** YES

**Query result:**
```json
{
  "id": "global",
  "github_enabled": true,
  "hackathon_enabled": true,
  "linkedin_enabled": true,
  "academic_enabled": true,
  "updated_at": "2026-09-20T12:49:17.988Z"
}
```

Row was last modified: `2026-09-20T12:49:17.988Z` (from a previous `PUT` call, confirmed in audit logs).

**Audit log confirms previous operation:**
```json
{
  "action": "ANALYTICS_VISIBILITY_UPDATED",
  "entity_type": "SYSTEM_SETTINGS",
  "entity_id": "global",
  "details": "Updated analytics visibility settings.",
  "created_at": "2026-09-20T12:49:17.992Z"
}
```

---

## Root Cause Analysis

### What was reported vs. what is actually happening

**Reported:** `GET /api/admin/analytics-visibility` returns HTML/404.

**What is actually happening:**
The browser has a **`role: teacher` JWT** stored in `localStorage` (`vission_academy_jwt`). The admin endpoint correctly rejects teacher tokens with **`403 JSON`** — not HTML, and not 404.

The original claim of "HTML/404" likely occurred in one of these scenarios:
1. The endpoint was tested **before** `admin-routes.ts` was loaded (server not yet started, Vite dev server returned HTML 404)
2. OR the test was done with no token at all and Vite intercepted it (very unlikely given correct ordering in `server.ts`)

**The real remaining problem is NOT the API endpoint itself**, but:

1. **Browser session mismatch:** The currently logged-in browser user is a **teacher** (`qateacher1@test.com`), not admin. The `AdminView` component is gated by `currentUser.role === 'admin'` in `App.tsx` line 126, so the admin should not see `AdminView` while logged in as teacher. **When the admin logs in, the endpoint works correctly.**

2. **`AdminView.tsx` line 208 bypasses the centralized `api.ts` request function** by calling `fetch()` directly with `localStorage.getItem('vission_academy_jwt')`. This is identical to what `api.ts` does (same token key), but is a code hygiene issue — it does not cause a functional failure.

3. **The AdminView has no analytics visibility checkbox UI.** The `visibilityData` is fetched and stored in `analyticsVisibility` state, but no Settings tab UI renders checkboxes for these four settings.

---

## Root Cause

**Classification: E (Middleware/auth rejection)**

The endpoint itself is correctly implemented and working. When called with a valid `role: admin` JWT, it returns HTTP 200 with correct JSON.

The "failure" seen was:
- The browser was logged in as a **teacher** (`role: teacher`)
- The admin endpoint correctly returns **403** for teacher tokens
- The original report of "HTML/404" does not match current runtime behavior — the endpoint returns JSON in all tested cases

**The two actual remaining gaps are:**

**Gap 1 (API — already working):** The endpoint is fully functional. No fix required.

**Gap 2 (Admin UI — missing):** `AdminView.tsx` fetches `analyticsVisibility` state but has no UI controls (checkboxes) rendered to display or modify it. The settings tab needs the Analytics Visibility section with four checkboxes.

---

## Required Fix

> **Fix required:** Add the Analytics Visibility checkbox section to the existing AdminView Settings tab (`AdminView.tsx`) — the API and database are already working correctly; only the UI component is missing.

---

## Evidence Summary

| Check | Result |
|---|---|
| Server entry point | `server.ts` (tsx) — CONFIRMED |
| Admin router mounted | `app.use('/api/admin', adminRoutes)` L41 — CONFIRMED |
| Route exists | `router.get('/analytics-visibility', ...)` L362 — CONFIRMED |
| Auth middleware | `router.use(requireAuth, requireRole('admin'))` L38 — CONFIRMED |
| No auth → 401 JSON | ✅ Correct |
| Teacher JWT → 403 JSON | ✅ Correct (not HTML, not 404) |
| Admin JWT → 200 JSON | ✅ Correct with all 4 fields |
| DB table exists | ✅ YES, row exists with defaults |
| Vite fallback involved | ❌ NO — Express routes match before Vite |
| Browser session | Teacher (qateacher1@test.com) — must login as admin to use AdminView |

---

## Final Verdict

```
ROOT CAUSE:
E — Middleware/auth rejection (teacher JWT in browser, not admin JWT)

CURRENT ENDPOINT STATUS:
PASS — returns HTTP 200 with correct JSON when called with admin JWT

FIX REQUIRED:
Add Analytics Visibility checkbox UI to the AdminView Settings tab;
the backend endpoint is fully working and needs no changes.
```
