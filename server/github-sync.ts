/**
 * server/github-sync.ts
 * ---------------------
 * GitHub Monthly Synchronization Service
 *
 * Fetches public GitHub profile data for students and stores historical
 * monthly snapshots in PostgreSQL.  Historical rows are NEVER overwritten.
 *
 * Environment variables:
 *   GITHUB_TOKEN  (optional) — Personal Access Token for authenticated GitHub
 *                 API calls.  Required for contribution count data via GraphQL.
 *                 Without it: rate limit is 60 req/hr; contributions = null.
 *                 With it:    rate limit is 5 000 req/hr; contributions available.
 *
 * SECURITY:
 *   - GITHUB_TOKEN is read only from process.env (never logged, never exposed to frontend)
 *   - Token is sent only via server-side HTTP Authorization header
 */

import { query, id } from './db.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GitHubSnapshotData {
  username: string;
  public_repos: number | null;
  total_stars: number | null;
  total_forks: number | null;
  followers: number | null;
  languages: string[];
  top_repos: Array<{
    name: string;
    url: string;
    description: string | null;
    stars: number;
    language: string | null;
  }>;
  total_contributions: number | null; // null if no GITHUB_TOKEN
}

export interface SnapshotSyncResult {
  studentId: string;
  username: string | null;
  status: 'synced' | 'failed' | 'not_synced' | 'rate_limited';
  error?: string;
}

export interface MonthlySyncResult {
  month: string;
  studentsFound: number;
  studentsSynced: number;
  studentsSkipped: number;  // no github_url
  studentsFailed: number;
  rateLimited: number;      // API rate limit hit
  startedAt: string;
  completedAt: string;
  details: SnapshotSyncResult[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract GitHub username from a profile URL */
export function extractGitHubUsername(githubUrl: string): string | null {
  const match = githubUrl.match(/github\.com\/([^\/\s?#]+)/i);
  return match ? match[1] : null;
}

/** Current month in YYYY-MM format */
export function currentMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Sleep for ms milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Build Authorization header value (or undefined if no token) */
function authHeader(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  if (token && token.trim()) {
    return { Authorization: `token ${token.trim()}` };
  }
  return {};
}

// ── GitHub API Fetcher ────────────────────────────────────────────────────────

/**
 * Fetch public GitHub profile + repo data for a username.
 * If GITHUB_TOKEN is set, also queries GraphQL for contribution count.
 *
 * IMPORTANT: GitHub REST API does NOT provide contribution calendar/counts
 * without authentication via GraphQL.  total_contributions will be null
 * when no token is configured.
 */
async function fetchGitHubData(username: string): Promise<GitHubSnapshotData> {
  const headers: Record<string, string> = {
    'User-Agent': 'VissionAcademy/1.0 (academic-tracker)',
    'Accept': 'application/vnd.github.v3+json',
    ...authHeader(),
  };

  // 1. Fetch user profile
  const profileRes = await fetch(`https://api.github.com/users/${username}`, { headers });

  // Check rate limit
  const remaining = profileRes.headers.get('X-RateLimit-Remaining');
  if (remaining !== null && Number(remaining) < 5) {
    const resetEpoch = Number(profileRes.headers.get('X-RateLimit-Reset') ?? 0);
    const waitMs = Math.max(0, resetEpoch * 1000 - Date.now()) + 2000;
    console.warn(`[GitHub Sync] ⚠️  Rate limit low (${remaining} remaining). Waiting ${Math.ceil(waitMs / 1000)}s…`);
    await sleep(waitMs);
  }

  if (profileRes.status === 404) throw new Error(`GitHub user '${username}' not found (404)`);
  if (profileRes.status === 403) {
    const error = new Error('GitHub API rate limit exceeded or access forbidden');
    (error as any).code = 'RATE_LIMIT';
    throw error;
  }
  if (!profileRes.ok) throw new Error(`GitHub API error for user profile: ${profileRes.status} ${profileRes.statusText}`);

  const profileData = await profileRes.json() as Record<string, any>;

  // 2. Fetch public repos (up to 100, sorted by last pushed)
  const reposRes = await fetch(
    `https://api.github.com/users/${username}/repos?per_page=100&sort=pushed&type=owner`,
    { headers }
  );
  const reposData: any[] = reposRes.ok ? await reposRes.json() : [];

  const totalStars = reposData.reduce((acc, r) => acc + (r.stargazers_count || 0), 0);
  const totalForks = reposData.reduce((acc, r) => acc + (r.forks_count || 0), 0);
  const languages = Array.from(new Set(reposData.map((r) => r.language).filter(Boolean))) as string[];

  const topRepos = reposData
    .sort((a, b) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0))
    .slice(0, 5)
    .map((r) => ({
      name: r.name,
      url: r.html_url,
      description: r.description ?? null,
      stars: r.stargazers_count ?? 0,
      language: r.language ?? null,
    }));

  // 3. Optionally fetch contribution count via GraphQL (requires GITHUB_TOKEN)
  let totalContributions: number | null = null;
  const token = process.env.GITHUB_TOKEN;
  if (token && token.trim()) {
    try {
      const graphqlRes = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `query($login: String!) {
            user(login: $login) {
              contributionsCollection {
                contributionCalendar {
                  totalContributions
                }
              }
            }
          }`,
          variables: { login: username },
        }),
      });
      if (graphqlRes.ok) {
        const gql = await graphqlRes.json() as Record<string, any>;
        totalContributions =
          gql?.data?.user?.contributionsCollection?.contributionCalendar?.totalContributions ?? null;
      } else {
        console.warn(`[GitHub Sync] GraphQL response ${graphqlRes.status} for ${username} — contributions set to null`);
      }
    } catch (gqlErr: any) {
      console.warn(`[GitHub Sync] GraphQL fetch failed for ${username}: ${gqlErr.message} — contributions set to null`);
    }
  }

  return {
    username: profileData.login ?? username,
    public_repos: profileData.public_repos ?? null,
    total_stars: totalStars,
    total_forks: totalForks,
    followers: profileData.followers ?? null,
    languages,
    top_repos: topRepos,
    total_contributions: totalContributions,
  };
}

// ── Single Student Sync ───────────────────────────────────────────────────────

async function syncOneStudent(
  student: { id: string; github_url: string | null; full_name: string; roll_number: string },
  month: string
): Promise<SnapshotSyncResult> {
  // No GitHub URL — store not_synced marker
  if (!student.github_url || !student.github_url.trim()) {
    await upsertSnapshot({
      studentId: student.id,
      githubUsername: 'NOT_CONFIGURED',
      month,
      data: null,
      status: 'not_synced',
      error: 'No GitHub URL on student profile',
    });
    return { studentId: student.id, username: null, status: 'not_synced' };
  }

  const username = extractGitHubUsername(student.github_url);
  if (!username) {
    const errMsg = `Cannot parse GitHub username from URL: ${student.github_url}`;
    await upsertSnapshot({
      studentId: student.id,
      githubUsername: 'INVALID_URL',
      month,
      data: null,
      status: 'failed',
      error: errMsg,
    });
    console.error(`[GitHub Sync] ❌ ${student.roll_number} (${student.full_name}): ${errMsg}`);
    return { studentId: student.id, username: null, status: 'failed', error: errMsg };
  }

  try {
    const data = await fetchGitHubData(username);
    await upsertSnapshot({ studentId: student.id, githubUsername: username, month, data, status: 'synced', error: undefined });
    console.log(`[GitHub Sync] ✅ ${student.roll_number} (${username}) — repos:${data.public_repos} stars:${data.total_stars} contributions:${data.total_contributions ?? 'N/A'}`);
    return { studentId: student.id, username, status: 'synced' };
  } catch (err: any) {
    const errMsg = err.message || String(err);
    const isRateLimit = err.code === 'RATE_LIMIT';
    const finalStatus = isRateLimit ? 'rate_limited' : 'failed';
    
    await upsertSnapshot({
      studentId: student.id,
      githubUsername: username,
      month,
      data: null,
      status: finalStatus,
      error: errMsg,
    });
    
    if (isRateLimit) {
      console.warn(`[GitHub Sync] ⚠️ ${student.roll_number} (${username}): ${errMsg}`);
    } else {
      console.error(`[GitHub Sync] ❌ ${student.roll_number} (${username}): ${errMsg}`);
    }
    return { studentId: student.id, username, status: finalStatus, error: errMsg };
  }
}

// ── Upsert Snapshot ───────────────────────────────────────────────────────────

async function upsertSnapshot(opts: {
  studentId: string;
  githubUsername: string;
  month: string;
  data: GitHubSnapshotData | null;
  status: 'synced' | 'failed' | 'not_synced' | 'rate_limited';
  error: string | undefined;
}): Promise<void> {
  const snapshotId = id('ghs');
  const now = new Date().toISOString();

  await query(
    `INSERT INTO student_github_snapshots
       (id, student_id, github_username, snapshot_month, synced_at,
        public_repos, total_stars, total_forks, followers,
        languages, top_repos, total_contributions,
        raw_data, sync_status, error_message, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (student_id, snapshot_month) DO UPDATE SET
       github_username     = EXCLUDED.github_username,
       synced_at           = EXCLUDED.synced_at,
       public_repos        = EXCLUDED.public_repos,
       total_stars         = EXCLUDED.total_stars,
       total_forks         = EXCLUDED.total_forks,
       followers           = EXCLUDED.followers,
       languages           = EXCLUDED.languages,
       top_repos           = EXCLUDED.top_repos,
       total_contributions = EXCLUDED.total_contributions,
       raw_data            = EXCLUDED.raw_data,
       sync_status         = EXCLUDED.sync_status,
       error_message       = EXCLUDED.error_message`,
    [
      snapshotId,
      opts.studentId,
      opts.githubUsername,
      opts.month,
      now,
      opts.data?.public_repos ?? null,
      opts.data?.total_stars ?? null,
      opts.data?.total_forks ?? null,
      opts.data?.followers ?? null,
      JSON.stringify(opts.data?.languages ?? []),
      JSON.stringify(opts.data?.top_repos ?? []),
      opts.data?.total_contributions ?? null,
      opts.data ? JSON.stringify(opts.data) : null,
      opts.status === 'rate_limited' ? 'failed' : opts.status,
      opts.error ?? null,
      now,
    ]
  );
}

// ── Main Orchestrator ─────────────────────────────────────────────────────────

/**
 * Run the full monthly GitHub sync for all students.
 *
 * @param overrideMonth  YYYY-MM string.  Defaults to current month.
 *                       Useful for admin-triggered re-syncs of a specific month.
 */
export async function runMonthlyGitHubSync(overrideMonth?: string): Promise<MonthlySyncResult> {
  const month = overrideMonth ?? currentMonth();
  const startedAt = new Date().toISOString();
  const hasToken = !!(process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim());

  console.log(`[GitHub Sync] 🚀 GitHub monthly sync started | month=${month} | authenticated=${hasToken}`);

  // Find all students (with or without GitHub URL — we mark both)
  const studentsRes = await query<{
    id: string;
    github_url: string | null;
    full_name: string;
    roll_number: string;
  }>(
    `SELECT s.id, s.github_url, u.full_name, s.roll_number
     FROM students s
     JOIN users u ON u.id = s.user_id
     ORDER BY s.roll_number`
  );
  const students = studentsRes.rows;
  console.log(`[GitHub Sync] Found ${students.length} students to process`);

  const details: SnapshotSyncResult[] = [];
  let synced = 0, skipped = 0, failed = 0, rateLimited = 0;

  for (const student of students) {
    const result = await syncOneStudent(student, month);
    details.push(result);

    if (result.status === 'synced') synced++;
    else if (result.status === 'not_synced') skipped++;
    else if (result.status === 'rate_limited') rateLimited++;
    else failed++;

    // Respect rate limits: 500ms between students that have GitHub URLs
    if (student.github_url) {
      await sleep(500);
    }
  }

  const completedAt = new Date().toISOString();
  const summary: MonthlySyncResult = {
    month,
    studentsFound: students.length,
    studentsSynced: synced,
    studentsSkipped: skipped,
    studentsFailed: failed,
    rateLimited,
    startedAt,
    completedAt,
    details,
  };

  console.log(
    `[GitHub Sync] ✅ GitHub monthly sync completed | month=${month} | ` +
    `synced=${synced} skipped=${skipped} failed=${failed} rate_limited=${rateLimited} | ` +
    `duration=${Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000)}s`
  );

  return summary;
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

/**
 * Calculate milliseconds until the next 1st of the next month at 00:05 local time.
 * If today IS the 1st and it's before 00:05, fires today at 00:05.
 */
function msUntilNextMonthlySync(): number {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 5, 0, 0);
  // If we're already past next month's 1st (shouldn't happen), add another month
  const ms = target.getTime() - now.getTime();
  return ms > 0 ? ms : new Date(now.getFullYear(), now.getMonth() + 2, 1, 0, 5, 0, 0).getTime() - now.getTime();
}

/**
 * Start the monthly scheduler.
 * Fires on the 1st of each month at 00:05 local time.
 * Also checks on startup whether the current month's sync has run.
 */
export async function startGitHubScheduler(): Promise<void> {
  console.log('[GitHub Sync] 📅 Monthly GitHub scheduler initialised');

  // Startup check: if current month has no synced snapshots but there are students
  // with GitHub URLs, trigger an immediate sync (e.g. first deploy on the 1st).
  try {
    const month = currentMonth();
    const checkRes = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM student_github_snapshots WHERE snapshot_month=$1 AND sync_status='synced'`,
      [month]
    );
    const existingCount = parseInt(checkRes.rows[0]?.count ?? '0', 10);

    const eligibleRes = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM students WHERE github_url IS NOT NULL AND github_url != ''`
    );
    const eligibleCount = parseInt(eligibleRes.rows[0]?.count ?? '0', 10);

    if (eligibleCount > 0 && existingCount === 0) {
      const today = new Date();
      const isFirstOfMonth = today.getDate() === 1;
      if (isFirstOfMonth) {
        console.log(`[GitHub Sync] 📌 First-of-month detected on startup — triggering immediate sync for ${month}`);
        runMonthlyGitHubSync().catch((err) =>
          console.error('[GitHub Sync] Startup sync error:', err.message)
        );
      } else {
        console.log(`[GitHub Sync] ℹ️  No synced snapshots for ${month} yet — will sync on 1st of next month`);
      }
    } else if (existingCount > 0) {
      console.log(`[GitHub Sync] ℹ️  Current month (${month}) already has ${existingCount} synced snapshots`);
    }
  } catch (err: any) {
    console.warn('[GitHub Sync] Startup check failed (table may not exist yet):', err.message);
  }

  // Schedule future runs
  function scheduleNextRun(): void {
    const ms = msUntilNextMonthlySync();
    const nextDate = new Date(Date.now() + ms);
    console.log(`[GitHub Sync] 🕐 Next monthly sync scheduled for ${nextDate.toLocaleDateString()} ${nextDate.toLocaleTimeString()}`);
    setTimeout(async () => {
      try {
        await runMonthlyGitHubSync();
      } catch (err: any) {
        console.error('[GitHub Sync] Monthly sync error:', err.message);
      }
      scheduleNextRun(); // Schedule the next one
    }, ms);
  }

  scheduleNextRun();
}
