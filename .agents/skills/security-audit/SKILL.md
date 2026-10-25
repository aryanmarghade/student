---
name: security-audit
description: Use when touching server/*, any /api route, auth, uploads, or the AI assistant. Also before declaring any feature done. Audits RBAC, IDOR, SQL injection, upload vulnerabilities, JWT security, and data leakage.
---

# Security Audit - Vission Academy

## When to Run
- Touching any backend route in `server/routes/*.ts` or `server.ts`.
- Modifying authentication or authorization middleware in `server/auth.ts`.
- Updating file handling (`multer`, `jszip`) in upload routes.
- Updating AI Assistant integration (`server/ai-assistant.ts`, `server/ai.ts`).
- Mandatory pre-release security validation before declaring any task complete.

## Audit Dimensions & Concrete Requirements

### 1. Role-Based Access Control (RBAC) & API Guarding
- Every endpoint in `server/routes/admin-routes.ts`, `server/routes/teacher-routes.ts`, `server/routes/student-routes.ts`, `server/routes/placement-routes.ts`, and `server/routes/ai-feedback-routes.ts` MUST declare `requireAuth` and `requireRole(...)`.
- Frontend hiding of tabs or navigation links is purely visual. The server must reject unauthorized role requests with 403 Forbidden.

### 2. Insecure Direct Object Reference (IDOR) Protection
- **Teachers**: Can only read/update marks, students, and assessments for classes assigned in `teacher_class_assignments`. Must never access arbitrary `class_id` or `student_id`.
- **Students**: Scoped strictly to their own `user.id`. Must never read another student's marks, dossier, or transcripts by changing `studentId` in URL or body.
- **Placement**: Can only view student fields permitted by admin visibility flags.

### 3. Visibility Flags API Enforcement
- Check `teacher_analytics_visibility` and `placement_analytics_visibility` in PostgreSQL.
- If a toggle is `false` (academic, github, hackerrank, linkedin, leetcode, hackathons), that data block MUST be stripped or omitted at the API layer. Disabled data must never reach client JSON payloads.

### 4. Authentication, JWT & Password Reset
- `JWT_SECRET` must load from `process.env`. Throw if secret is missing or default.
- Passwords must be hashed with `bcryptjs` using minimum salt rounds (>= 10).
- Users with `must_reset_password = true` must be blocked server-side from non-auth API endpoints until password update completes via `/api/auth/reset-password`.
- Strict rate limiting on `/api/auth/login` and `/api/auth/reset-password`.

### 5. SQL Injection & Database Safety
- Every query through `query()` in `server/db.ts` MUST use parameterized placeholders (`$1, $2, ...`).
- Absolutely zero string concatenation or template literal interpolation for SQL clauses.

### 6. Upload Vulnerabilities (`multer`, `jszip`)
- Limit upload size (e.g. 10MB) and whitelist MIME types (`application/pdf`, `image/jpeg`, `image/png`, `application/zip`).
- Sanitize filenames to prevent path traversal (e.g. `../../etc/passwd`).
- Zip-Slip and Zip-Bomb protection: during ZIP unpacking, verify extracted file paths stay within target directory and enforce decompressed file size quotas. Never execute or run scripts from `uploads/`.

### 7. Input Validation, XSS & Security Headers
- Validate params, query, and request body types before processing.
- Prevent XSS by escaping or sanitizing user-supplied HTML in student bios, posts, and notices.
- Security headers (helmet-equivalent: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, strict CORS origin).
- Suppress stack traces in API error responses in production.

### 8. External API Sync & SSRF
- In `server/github-sync.ts`, `server/leetcode-sync.ts`, `server/linkedin-sync.ts`, and `server/hackerrank-sync.ts`:
  - Validate and normalize external usernames/URLs.
  - Enforce request timeouts (<= 10s) and restrict target hostnames to avoid SSRF.

### 9. AI Assistant Security (`server/ai-assistant.ts`)
- Grounded tool calls must accept the calling user's session role and scope queries accordingly.
- Filter and sanitize prompts against prompt injection.
- Exclude passwords, hashes, and secrets from `ai_query_logs`.

### 10. Secrets & Legacy Code
- Never log or commit secrets or tokens.
- Ensure dead legacy files (`server/index.ts`, `src/api.ts`) are completely unreachable.

## Output Format
```markdown
### [Severity: Critical|High|Medium|Low] <Vulnerability Title>
- **File & Line**: `server/routes/...:line`
- **Vulnerability**: Clear explanation of security risk
- **How to Reproduce**: Exact curl command or request payload
- **Recommended Fix**: Code diff or specific remediation
```

See [security-checklist.md](file:///c:/Users/Aryan/Downloads/vission-academy/.agent/skills/security-audit/references/security-checklist.md) for full inspection routines.
