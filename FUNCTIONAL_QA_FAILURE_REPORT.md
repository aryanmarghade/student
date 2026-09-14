# Functional QA Failure Report

## [VERIFIED] Live admin and teacher browser login paths are working with the current PostgreSQL QA state

Area: Browser login, role routing, and teacher workspace verification  
Actual: The live PostgreSQL QA state is the source of truth, and the browser flows were re-tested against it successfully. The admin account (`admin@visionacademy.edu` / `password123`) rendered the admin dashboard correctly. QA teacher accounts logged in successfully in the live application, and the teacher workspaces rendered the expected active assignments and rosters for QA Teacher 1, QA Teacher 2, and QA Teacher 4.  
Impact: The live admin and teacher roles are functioning correctly in the current app state.  
Severity: None

## [VERIFIED] QA credential state in PostgreSQL is now internally consistent

Area: Authentication setup and QA environment state  
Actual: The live QA accounts in PostgreSQL were restored to the intended `password123` state for the admin account and all QA teacher/student accounts. The stale UI text and `.env` documentation that advertised mismatched credentials were corrected, and the browser/API verification was conducted against the live database state rather than stale documentation.  
Impact: The authentication setup is now aligned across the application, UI, and local QA environment.  
Severity: None

## [VERIFIED] Student browser workspace is loading correctly for the live QA profile

Area: Student login, profile rendering, and persisted UI state  
Actual: QA Student 01 logged in successfully and rendered the live student workspace, including the profile header, profile-strength panel, bio/resume sections, and the main navigation tabs. The student UI was loading from the live backend state rather than stale/mock data.  
Impact: The student role is functioning correctly in the current runtime state.  
Severity: None

## [BLOCKED] Gemini is unavailable in this environment

Area: Academic AI  
Actual: `GEMINI_API_KEY` is blank in `.env`, so Gemini execution could not be tested in this session. The AI endpoint was still exercised and correctly resolved to the PostgreSQL-scoped fallback path with `resolvedIntent: postgresql_scoped_summary`.  
Impact: Gemini model execution and Gemini-specific behavior remain unverified.  
Severity: Medium

## [VERIFIED] Core RBAC, privacy, and document protections remain intact

Area: RBAC, analytics, documents, and access control  
Actual: The following live behaviors were verified through API checks and browser-backed flows:
- Teacher assignment, roster, and unauthorized-class denial paths returned the expected results.
- Student document upload persisted correctly and stored the expected file path.
- Student document privacy controls enforced isolation between students, and unauthenticated access returned `401`.
- Bulk ZIP marksheet upload correctly rejected invalid file types and duplicate submissions, and unauthorized student access returned `403`.
- AI fallback behaved as expected, returning the PostgreSQL-scoped summary path.
  
Impact: The core role-based backend protections and document isolation logic are validated.  
Severity: None

## [VERIFIED] Build and type-check status

Area: Verification  
Actual: `npm run lint` completed successfully with no TypeScript errors, and `npm run build` completed successfully for the Vite frontend plus the bundled Node server.  
Impact: The repository is currently in a clean compile/build state.  
Severity: None
