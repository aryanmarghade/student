# FUNCTIONAL QA FAILURE REPORT

## [PARTIAL] Teacher profiles were only regression-tested for Students 01 and 02

Area: Teacher student profile
Role: Teacher 1
Workflow: Assigned Class -> Student Roster -> Portfolio
Expected: Students 01 through 10 open without a React error or blank page.
Actual: Students 01 and 02 opened successfully after fixing the flat profile response dereference. Students 03 through 10 were not individually opened in this regression run.
Evidence: Live browser opened QA Student 01 and QA Student 02 portfolio dossiers with names, roll numbers, class, and profile strength; no page error occurred. TypeScript validation passed.
Severity: Medium
Reproduction: Log in as each assigned teacher and open every roster student's Portfolio action.

## [FAIL] Runtime data is not PostgreSQL source of truth

Area: Persistence and storage
Role: All roles
Workflow: Save -> refresh -> logout/login -> restart server -> verify users, classes, assignments, marks, documents, and official marksheets.
Expected: PostgreSQL remains authoritative and all records survive a server restart.
Actual: The application initializes and reads operational records from `memDb`; the restart regression reset the uploaded marksheet and runtime records. `DATABASE_URL` may initialize a pool, but the application does not hydrate the runtime model from PostgreSQL or persist the broad set of mutations there.
Evidence: `server/db.ts` defines the active collections as in-memory arrays; routes across admin, teacher, and student workflows read/write those arrays. Restarting the server cleared the prior browser-uploaded marksheet.
Severity: Blocker
Reproduction: Upload or edit a record, restart `npm run dev`, log back in, and inspect the record.

## [PARTIAL] Official marksheet backend coverage for every invalid extension was not browser-verified

Area: Official PDF upload validation
Role: Admin
Workflow: Choose each prohibited file type and submit.
Expected: JPG, JPEG, PNG, DOC, DOCX, PPT, PPTX, XLS, XLSX, ZIP, and TXT are rejected by both frontend and backend.
Actual: A real browser file-picker test rejected a `.jpg` with `Only valid PDF files are accepted.` The backend checks PDF MIME, `.pdf` extension, and `%PDF-` signature, but the remaining prohibited extensions were not each submitted through the browser regression.
Evidence: Real `qa-invalid.jpg` file-picker test; server-side `multer` filter and PDF signature check in `server/routes/admin-routes.ts`.
Severity: Medium
Reproduction: Repeat the browser file-picker test with each prohibited extension and separately issue authenticated multipart requests.

## [PARTIAL] Teacher profile and RBAC matrix was not fully browser-verified

Area: Teacher workflow and authorization
Role: Teachers 1-4
Workflow: Login -> assigned class -> roster -> every student profile; attempt every other semester.
Expected: Each teacher sees exactly the assigned semester, all assigned profiles open, and every other semester returns 403.
Actual: Teacher 1's assigned roster and Student 01/02 profiles were verified. A direct authenticated request by Teacher 1 to Semester 2 returned 403. The complete Teacher 2-4 profile and cross-semester matrix was not run.
Evidence: Browser UI and authenticated request returned `403 Access Denied` for Teacher 1 -> `cls_sem_2`.
Severity: Medium
Reproduction: Repeat the matrix for all four teacher accounts and all four class IDs.

## [BLOCKED] PostgreSQL-backed marks, analytics, Gemini, and document persistence regression

Area: Marks persistence, analytics, Gemini RBAC, student document storage
Role: Teachers and students
Workflow: Save marks or upload documents -> refresh -> logout/login -> restart -> verify analytics, prediction, AI explanation, and files.
Expected: Calculations use persisted PostgreSQL records, AI is scoped to authorized data, and uploaded documents survive restart.
Actual: These workflows were not claimed as passing because the current runtime persistence layer is in-memory and the full restart regression cannot establish PostgreSQL durability.
Evidence: Same `memDb` implementation and route usage described above; no PostgreSQL hydration/persistence path covers these records.
Severity: Blocker
Reproduction: Run the complete persistence and analytics workflow against a configured PostgreSQL instance after replacing the in-memory route data source.

## Regression Status

Teacher profiles: PARTIAL
Official PDF upload: PASS
Invalid file rejection: PARTIAL
Marksheet privacy: PASS
Teacher RBAC: PARTIAL
PostgreSQL persistence: FAIL
Marks persistence: BLOCKED
Analytics: BLOCKED
Gemini RBAC: BLOCKED
Student workflow: PARTIAL
Document storage: BLOCKED
Console/network: PARTIAL
