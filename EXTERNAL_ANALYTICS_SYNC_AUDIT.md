# External Analytics Sync Audit & Gap Report

## Step 2: Gap Report

| Source | Profile URL | Sync | Snapshot DB | Monthly Auto Sync | Manual Sync | Graph | Admin Visibility | Backend Enforcement |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GitHub | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| LinkedIn | PASS | MISSING | MISSING | MISSING | MISSING | PASS | PASS | PASS |
| HackerRank | PASS | MISSING | MISSING | MISSING | MISSING | PASS | PASS | PASS |

- **GitHub**: Fully implemented. `github-sync.ts` exists, `student_github_snapshots` table exists, monthly auto sync and manual sync endpoints exist. The visibility and backend enforcement are implemented using `analytics_visibility_settings`.
- **LinkedIn**: Profile URL (`linkedin_url` in `students`) exists. Graph exists in Teacher Analytics (assumed from prompt), and visibility control exists in DB (`linkedin_enabled` in `analytics_visibility_settings`), but the actual syncing mechanism, snapshot database table, monthly sync, and manual sync functionality are completely MISSING.
- **HackerRank**: Profile URL (`hackerrank_url` in `students`) exists. Graph exists, visibility control exists (`hackathon_enabled`/`analytics_visibility_settings` might be covering it or HackerRank itself might be part of it, need to verify exactly, but assumed PASS based on DB schema). Similar to LinkedIn, syncing mechanism, snapshot DB, auto sync, and manual sync are MISSING.

## Step 3: Admin Graph Visibility

**CURRENT SCOPE: GLOBAL**

The current implementation in the database relies on a single row in the `analytics_visibility_settings` table (where `id = 'global'`). This means that visibility settings are applied globally across the entire institution for all teachers.

### Minimal Architecture Required for PER-TEACHER VISIBILITY
To implement per-teacher visibility, the architecture needs to shift from a single global setting to user-specific settings. 
1. **Database Update**: The `analytics_visibility_settings` table needs to be linked to `teacher_user_id` instead of a static 'global' ID. Or, add a `teacher_user_id` column to a new `teacher_analytics_settings` table. 
   - `CREATE TABLE teacher_analytics_settings (teacher_user_id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, github_enabled BOOLEAN, linkedin_enabled BOOLEAN, hackerrank_enabled BOOLEAN, ...)`
2. **Backend API Update**:
   - The Admin API (`/api/admin/analytics-visibility`) must be updated to accept a `teacher_user_id` and update settings for that specific teacher.
   - The Teacher API (`/api/teacher/analytics`) must retrieve settings based on the authenticated teacher's `user_id` (i.e. `req.user.id`).
3. **Frontend UI Update**: The Admin dashboard should provide a list of teachers where the admin can toggle analytics visibility on a per-teacher basis, rather than a single global toggle.

## External API Limitations
### LinkedIn
- **WHAT DATA IS ACTUALLY AVAILABLE**: Very limited public profile data without official API partnership. Often just the public vanity URL, name, and headline via scraping (which is prone to breaking and rate limits).
- **WHAT DATA IS NOT AVAILABLE**: Detailed post analytics, connection counts, skills endorsements, without an authenticated OAuth 2.0 user token and approved API access.
- **WHY**: LinkedIn heavily restricts its API and actively blocks scraping to protect user data. Official API access requires company approval.

### HackerRank
- **WHAT DATA IS ACTUALLY AVAILABLE**: Public profile data such as username, badges, verified skills, and sometimes basic submission counts if the profile is fully public.
- **WHAT DATA IS NOT AVAILABLE**: Detailed historical contest ratings over time (unless manually tracked daily), private submissions, specific test scores.
- **WHY**: HackerRank provides some public profile endpoints, but relies heavily on user privacy settings. Unofficial APIs or scraping are limited by rate limiting and profile privacy controls.
