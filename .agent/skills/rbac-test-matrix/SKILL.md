---
name: rbac-test-matrix
description: Use when testing permissions or after changing roles, routes, or visibility. Tests API endpoints across all 4 roles (admin, teacher, student, placement) with positive and negative authorization tests.
---

# RBAC Test Matrix - Vission Academy

## Purpose
Validates that every endpoint across the Vission Academy API correctly enforces Role-Based Access Control (RBAC). Ensures unauthorized roles, unauthenticated clients, and cross-tenant callers are strictly blocked.

## Verification Matrix
The authoritative endpoint permission matrix covering all 4 roles (`admin`, `teacher`, `student`, `placement`) is documented in [matrix.md](file:///c:/Users/Aryan/Downloads/vission-academy/.agent/skills/rbac-test-matrix/references/matrix.md).

## Verification Test Scenarios (Playwright API Testing)
For every protected route, execute the following 5 test vectors:
1. **No Token (Unauthenticated)**:
   - Call endpoint with no `Authorization` header.
   - Expected Result: `401 Unauthorized`.
2. **Expired or Invalid Token**:
   - Call endpoint with corrupted or expired JWT.
   - Expected Result: `401 Unauthorized`.
3. **Wrong Role (Cross-Role Violation)**:
   - Example: A `student` token calling `/api/admin/users` or `/api/teacher/classes`.
   - Example: A `teacher` token calling `/api/placement/dashboard`.
   - Expected Result: `403 Forbidden`.
4. **Cross-Tenant IDOR (ID Swapping)**:
   - Example: Student A requesting `/api/student/marks` for Student B's user ID.
   - Example: Teacher A requesting student marks for Class B (not assigned in `teacher_class_assignments`).
   - Expected Result: `403 Forbidden` or `404 Not Found`.
5. **Visibility Flag Gating**:
   - Toggle platform visibility off in admin settings (`github_enabled = false`, `leetcode_enabled = false`, etc.).
   - Make request as teacher or placement officer.
   - Expected Result: `200 OK`, but the disabled platform data is completely omitted from the response JSON payload.

## Repeatable Playwright Spec
Automated regression tests are located at:
`tests/rbac.spec.ts`

### Running the RBAC Playwright Suite
```bash
# Ensure local dev server is running on http://localhost:3000
npm run dev

# Run RBAC test suite
npx playwright test tests/rbac.spec.ts
```

### Reporting Test Results
Document test outcomes in the following format:
```markdown
| Endpoint | Method | Role Tested | Scenario | Expected | Actual | Pass/Fail |
|---|---|---|---|---|---|---|
| `/api/admin/users` | GET | student | Wrong Role | 403 | 403 | PASS |
| `/api/teacher/classes` | GET | teacher | Assigned Class | 200 | 200 | PASS |
| `/api/teacher/classes` | GET | teacher | Unassigned Class | 403 | 403 | PASS |
```
