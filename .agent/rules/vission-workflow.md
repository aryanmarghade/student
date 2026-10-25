# Vission Academy Development Workflow & Integrity Rules

You are working on the Vission Academy project. The following rules are MANDATORY and must be applied to every task:

1. **Before Any Task**:
   - Read `PROJECT_MAP.txt` first. It is the authoritative source of truth for architecture, roles, active files, and database schemas.

2. **Frontend & UI Work**:
   - Apply `web-design-quality` and `ui-buttons-and-interactions` to every change in `src/views/` or `src/components/`.
   - Ensure complete button states (loading, disabled, hover, active), double-submit prevention, confirmation modals on destructive actions, 4.5:1 contrast, and responsive layout fidelity.

3. **Backend, Auth, or Upload Work**:
   - Apply `security-audit` to every change in `server/*`, routes, authentication, file handling, and external synchronization.
   - Enforce server-side RBAC, prevent IDOR, parameterized queries, sanitize uploads, enforce visibility flags at the API layer, and secure JWT handling.

4. **Verification & Completion Mandate**:
   - Before reporting any task complete, run `browser-qa` across all affected roles.
   - If permissions, roles, or visibility flags are involved, run `rbac-test-matrix`.
   - **Never claim something works without having actually run and verified it in the local environment.**

5. **Documentation Synchronization**:
   - After completing code modifications, run `project-map-sync` to update `PROJECT_MAP.txt` with change summaries, schema updates, and audit records.
