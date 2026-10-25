---
name: project-map-sync
description: Use after any change that adds or modifies routes, tables, files, or features. Synchronizes PROJECT_MAP.txt with the actual codebase architecture, endpoints, database tables, and audit logs.
---

# Project Map Sync - Vission Academy

## Purpose
`PROJECT_MAP.txt` is the authoritative, machine-readable source of truth for the entire Vission Academy application. Whenever a developer or AI agent modifies backend routes, database tables, frontend views, or adds new features, `PROJECT_MAP.txt` must be updated immediately to preserve system documentation integrity.

## Synchronization Protocol

### 1. Trigger Conditions
Execute this skill whenever you:
- Add, alter, or remove database tables or columns (e.g. migrations in `server/db.ts`).
- Add or modify REST API endpoints in `server/routes/*.ts` or `server.ts`.
- Add, refactor, or delete frontend views in `src/views/` or components in `src/components/`.
- Add new background sync jobs or scheduler services (e.g. `server/*-sync.ts`).
- Perform security audits or verification passes with verifiable test outcomes.

### 2. Required Sections to Update in `PROJECT_MAP.txt`
1. **Section 3: RECENT CHANGES & NEW IMPLEMENTATIONS**:
   - Record the timestamp (`YYYY-MM-DD`).
   - Bullet point summary of all architectural changes, schema additions, or new modules implemented.
2. **Section 4: COMPLETE BACKEND FILE MAP**:
   - If new files are created, define their Purpose, Responsibilities, and Status (`ACTIVE`).
   - If files are deprecated, move them under `[ LEGACY / UNUSED FILES ]`.
3. **Section 5: COMPLETE FRONTEND FILE MAP**:
   - Update view capabilities, routing paths, or component additions.
4. **Section 6: DETAILED ROLE-BY-ROLE FEATURES & ACCESS CAPABILITIES**:
   - Reflect any changes to capabilities available to `admin`, `teacher`, `placement`, or `student`.
5. **Section 7: DATABASE SCHEMA & RBAC RELATIONSHIPS**:
   - Update table definitions, foreign keys, or visibility relationship flags.
6. **Section 8: VERIFIED RECENT AUDIT LOGS**:
   - Append date, scope of audit, verified criteria, and references to report artifacts.

## Critical Rules
- ❌ **NEVER write real secrets, passwords, API keys, or JWT tokens** into `PROJECT_MAP.txt`.
- ❌ Do not remove existing architectural history without explicit justification.
- Ensure formatting adheres to the clean ASCII header sections established in `PROJECT_MAP.txt`.
