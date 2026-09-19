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

## [VERIFIED] Teacher student portfolio profile renders correctly in the browser

Area: Teacher workspace profile experience  
Actual: The teacher roster’s Portfolio button was opened in the live browser, and the updated student profile modal rendered with a clean LinkedIn-style layout. The duplicate student name in the modal header was removed, leaving the profile header as “Student Portfolio” while the profile body correctly displayed the student’s name, roll number, profile strength, links, and sections.  
Impact: The teacher-facing student portfolio experience is now visually consistent and no longer repeats the student name in the header.  
Severity: None

## [VERIFIED] Class/subject/semester marks scoping is functioning in the live app

Area: Browser QA and PostgreSQL-backed marks isolation  
Actual: A live browser session for QA Teacher 2 loaded the correct scope (`QA Semester 2 Class — DBMS201 / Semester 2`) and showed the class-specific roster for Students 03–05. The live marks API for the teacher’s authorized scope returned the class-scoped grid with `CA 1` present in `cls_sem_2 / sbj_dbms / sem_2`, and the same assessment title was not present in the teacher’s other assigned scope (`cls_sem_3 / sbj_os / sem_3`). The teacher 3 API route for an unauthorized class/subject/semester returned `403` with `Access Denied: You are not assigned to this class, subject, and semester.`  
Impact: The marks system is now correctly isolated by class, subject, and semester in runtime storage and backend access control.  
Severity: None

## [VERIFIED] Max-mark validation is enforced at the backend

Area: Marks entry validation  
Actual: A direct API request to save `26` for `std_03` on `CA 1` (max 25) was rejected with HTTP `400` and the server response `Validation failed on submitted marks` / `std_03 CA 1: invalid mark`. This confirms the server-side guard is active in addition to client-side validation.  
Impact: Over-limit marks are blocked even when submitted directly through the API, preventing invalid data from reaching PostgreSQL.  
Severity: None

## [VERIFIED] Build and type-check status

Area: Verification  
Actual: `npm run lint` completed successfully with no TypeScript errors, `npm run build` completed successfully for the Vite frontend plus the bundled Node server, and the production bundle was generated successfully.  
Impact: The repository is currently in a clean compile/build state.  
Severity: None
