# Comprehensive Security Audit Checklist - Vission Academy

## 1. Authentication & Session Security (`server/auth.ts`, `server/routes/auth-routes.ts`)
- [ ] JWT secret is fetched from environment variable (`process.env.JWT_SECRET`) and rejects insecure fallbacks.
- [ ] Token expiration time is configured (`expiresIn: '24h'` or shorter).
- [ ] Password hashes use `bcryptjs` with >= 10 salt rounds.
- [ ] `/api/auth/login` implements IP or email-based rate limiting (preventing brute force).
- [ ] `/api/auth/reset-password` requires valid existing password or temporary token, updates `must_reset_password = false`, and invalidates old sessions.
- [ ] Server middleware checks `req.user.must_reset_password` and blocks API access until resolved.

## 2. Authorization & RBAC (`server/routes/*.ts`)
- [ ] `requireAuth` is mounted before every protected handler.
- [ ] `requireRole('admin')` protects all `/api/admin/*` endpoints.
- [ ] `requireRole('teacher')` protects all `/api/teacher/*` endpoints.
- [ ] `requireRole('student')` protects all `/api/student/*` endpoints.
- [ ] `requireRole('placement')` protects all `/api/placement/*` endpoints.
- [ ] Unauthenticated requests return `401 Unauthorized`.
- [ ] Unauthorized role requests return `403 Forbidden`.

## 3. IDOR (Insecure Direct Object References)
- [ ] In `/api/teacher/*`: verifies that requested `classId` is mapped to the logged-in teacher in `teacher_class_assignments`.
- [ ] In `/api/student/*`: student ID is always extracted from `req.user.id` or verified against `req.user.id`.
- [ ] In `/api/placement/*`: student dossier lookups only return fields permitted by `placement_analytics_visibility`.
- [ ] In `/api/admin/teachers/:id/analytics-visibility`: checks that `:id` corresponds to a valid teacher account.

## 4. SQL Injection Protection (`server/db.ts`)
- [ ] No `db.query(\`SELECT ... \${variable}\`)` template string interpolations exist.
- [ ] Dynamic filters (e.g. search by name, department, or year) use array parameters `$1, $2, ...`.
- [ ] Dynamic column ordering or table names, if any, are strictly whitelisted against an allowed list.

## 5. File Upload & Processing Security (`multer`, `jszip`)
- [ ] Multer configuration sets storage to a non-public folder (`uploads/`).
- [ ] Max file size limit is explicitly enforced (e.g. 10MB).
- [ ] File extension and MIME type whitelist enforced (rejecting `.exe`, `.sh`, `.php`, `.bat`, `.js`, etc.).
- [ ] Filenames sanitized using UUID or regex `replace(/[^a-zA-Z0-9.-]/g, '_')`.
- [ ] ZIP extraction loops verify `entry.name` does not contain `../` (Zip Slip vulnerability).
- [ ] ZIP decompression limits maximum uncompressed size and entry count (Zip Bomb defense).
- [ ] Direct HTTP static access to `uploads/` without authentication is blocked (404/403).

## 6. Data Visibility & Privacy
- [ ] When teacher or placement visibility flags have `github_enabled = false`, GitHub repositories and statistics are excluded from JSON responses.
- [ ] When `leetcode_enabled = false`, LeetCode problem solve stats are excluded.
- [ ] When `academic_enabled = false`, SGPA/CGPA history is excluded.
- [ ] Sensitive fields (passwords, salts, reset tokens) are excluded (`SELECT *` replaced with explicit column projections, or stripped before `res.json()`).

## 7. Network, Headers & Errors
- [ ] Security headers set: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`.
- [ ] CORS is restricted to trusted origins, rejecting unrestricted `*` when credentials are used.
- [ ] Generic error handler catches unhandled exceptions and prevents internal stack traces from leaking to client responses in production.

## 8. External Integrations & AI Assistant
- [ ] External fetch calls in `github-sync.ts`, `leetcode-sync.ts`, `linkedin-sync.ts`, `hackerrank-sync.ts` enforce 10-second timeouts.
- [ ] Target URLs are strictly constructed using official domains (`api.github.com`, `leetcode.com/graphql`).
- [ ] Grounded AI queries filter input to prevent system prompt extraction or SQL prompt injection.
