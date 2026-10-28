/**
 * server/hackerrank-sync.ts
 * -----------------------
 * HackerRank Monthly Synchronization Service
 * 
 * Simulates fetching public HackerRank profile data for students and stores historical
 * monthly snapshots in PostgreSQL. Historical rows are NEVER overwritten.
 */

import { query, id } from './db.js';
import { currentMonth } from './github-sync.js';

export interface HackerRankSnapshotData {
  badges_count: number | null;
  verified_skills: string[];
}

export interface SnapshotSyncResult {
  studentId: string;
  username: string | null;
  status: 'synced' | 'failed' | 'not_synced';
  error?: string;
}

export interface MonthlySyncResult {
  month: string;
  studentsFound: number;
  studentsSynced: number;
  studentsSkipped: number;
  studentsFailed: number;
  startedAt: string;
  completedAt: string;
  details: SnapshotSyncResult[];
}

export function extractHackerRankUsername(url: string): string | null {
  if (!url) return null;
  const match = url.match(/hackerrank\.com\/(?:profile\/)?([a-zA-Z0-9_\-\.]+)/i);
  return match ? match[1] : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch real public profile statistics from HackerRank public API
 */
export async function fetchHackerRankStats(username: string): Promise<{
  badges_count: number;
  verified_skills: string[];
  raw_data: any;
} | null> {
  const cleanUser = username.trim();
  if (!cleanUser || !/^[a-zA-Z0-9_\-\.]+$/.test(cleanUser)) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
    };

    const profileRes = await fetch(`https://www.hackerrank.com/rest/hackers/${encodeURIComponent(cleanUser)}`, {
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (profileRes.status === 404) {
      return null;
    }
    if (!profileRes.ok) {
      throw new Error(`HackerRank HTTP error ${profileRes.status}`);
    }

    const profileJson = await profileRes.json();
    if (!profileJson || profileJson.model?.deleted) {
      return null;
    }

    // Fetch badges
    let badges: any[] = [];
    try {
      const bController = new AbortController();
      const bTimeout = setTimeout(() => bController.abort(), 6000);
      const badgesRes = await fetch(`https://www.hackerrank.com/rest/hackers/${encodeURIComponent(cleanUser)}/badges`, {
        headers,
        signal: bController.signal,
      });
      clearTimeout(bTimeout);
      if (badgesRes.ok) {
        const bJson = await badgesRes.json();
        badges = Array.isArray(bJson.models) ? bJson.models : [];
      }
    } catch (_err) {
      // badges fetch error is non-fatal if profile succeeded
    }

    const verifiedSkills = badges.map((b: any) => b.badge_name || b.title).filter(Boolean);
    const badgesCount = badges.length;

    return {
      badges_count: badgesCount,
      verified_skills: verifiedSkills,
      raw_data: { profile: profileJson.model, badges },
    };
  } catch (err: any) {
    console.error(`[HackerRank Fetch] Error for ${cleanUser}:`, err.message);
    throw err;
  }
}

async function syncOneStudent(
  student: { id: string; hackerrank_url: string | null; full_name: string; roll_number: string },
  month: string
): Promise<SnapshotSyncResult> {
  if (student.id.startsWith('demo_') || (student.roll_number && student.roll_number.startsWith('DEMO'))) {
    return { studentId: student.id, username: null, status: 'not_synced', error: 'Skipped demo student' };
  }
  if (!student.hackerrank_url || !student.hackerrank_url.trim()) {
    return { studentId: student.id, username: null, status: 'not_synced' };
  }

  const username = extractHackerRankUsername(student.hackerrank_url);
  if (!username) {
    const errMsg = `Cannot parse HackerRank username from URL: ${student.hackerrank_url}`;
    console.error(`[HackerRank Sync] ❌ ${student.roll_number}: ${errMsg}`);
    await upsertSnapshot({
      studentId: student.id,
      hackerrankUsername: 'INVALID_URL',
      month,
      data: null,
      status: 'failed',
      error: errMsg,
    });
    return { studentId: student.id, username: null, status: 'failed', error: errMsg };
  }

  try {
    const data = await fetchHackerRankStats(username);
    if (!data) {
      const errMsg = `HackerRank profile '${username}' not found (404)`;
      await upsertSnapshot({
        studentId: student.id,
        hackerrankUsername: username,
        month,
        data: null,
        status: 'failed',
        error: errMsg,
      });
      return { studentId: student.id, username, status: 'failed', error: errMsg };
    }

    const hrData = {
      badges_count: data.badges_count,
      verified_skills: data.verified_skills,
      username,
      synced_at: new Date().toISOString(),
    };

    await upsertSnapshot({
      studentId: student.id,
      hackerrankUsername: username,
      month,
      data: { badges_count: data.badges_count, verified_skills: data.verified_skills },
      status: 'synced',
      error: undefined,
    });

    await query(
      `UPDATE students SET hackerrank_data = $1, hackerrank_synced_at = NOW() WHERE id = $2`,
      [JSON.stringify(hrData), student.id]
    );

    console.log(`[HackerRank Sync] ✅ ${student.roll_number} (${username}): ${data.badges_count} badges, ${data.verified_skills.length} skills`);
    return { studentId: student.id, username, status: 'synced' };
  } catch (err: any) {
    const errMsg = err.message || 'HackerRank API network/service error';
    await upsertSnapshot({
      studentId: student.id,
      hackerrankUsername: username,
      month,
      data: null,
      status: 'failed',
      error: errMsg,
    });
    return { studentId: student.id, username, status: 'failed', error: errMsg };
  }
}

async function upsertSnapshot(opts: {
  studentId: string;
  hackerrankUsername: string;
  month: string;
  data: HackerRankSnapshotData | null;
  status: 'synced' | 'failed' | 'not_synced';
  error: string | undefined;
}): Promise<void> {
  const snapshotId = id('hrs');
  const now = new Date().toISOString();

  await query(
    `INSERT INTO student_hackerrank_snapshots
       (id, student_id, hackerrank_username, snapshot_month, synced_at,
        badges_count, verified_skills,
        raw_data, sync_status, error_message, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (student_id, snapshot_month) DO UPDATE SET
       hackerrank_username = EXCLUDED.hackerrank_username,
       synced_at           = EXCLUDED.synced_at,
       badges_count        = EXCLUDED.badges_count,
       verified_skills     = EXCLUDED.verified_skills,
       raw_data            = EXCLUDED.raw_data,
       sync_status         = EXCLUDED.sync_status,
       error_message       = EXCLUDED.error_message`,
    [
      snapshotId,
      opts.studentId,
      opts.hackerrankUsername,
      opts.month,
      now,
      opts.data?.badges_count ?? null,
      JSON.stringify(opts.data?.verified_skills ?? []),
      opts.data ? JSON.stringify(opts.data) : null,
      opts.status,
      opts.error ?? null,
      now,
    ]
  );
}

export async function runMonthlyHackerRankSync(overrideMonth?: string): Promise<MonthlySyncResult> {
  const month = overrideMonth ?? currentMonth();
  const startedAt = new Date().toISOString();

  console.log(`[HackerRank Sync] 🚀 HackerRank monthly sync started | month=${month}`);

  const studentsRes = await query<{
    id: string;
    hackerrank_url: string | null;
    full_name: string;
    roll_number: string;
  }>(
    `SELECT s.id, s.hackerrank_url, u.full_name, s.roll_number
     FROM students s
     JOIN users u ON u.id = s.user_id
     WHERE s.id NOT LIKE 'demo_%' AND (s.roll_number NOT LIKE 'DEMO%' OR s.roll_number IS NULL)
     ORDER BY s.roll_number`
  );
  const students = studentsRes.rows;

  const details: SnapshotSyncResult[] = [];
  let synced = 0, skipped = 0, failed = 0;

  for (const student of students) {
    const result = await syncOneStudent(student, month);
    details.push(result);

    if (result.status === 'synced') synced++;
    else if (result.status === 'not_synced') skipped++;
    else failed++;
  }

  const completedAt = new Date().toISOString();
  const summary: MonthlySyncResult = {
    month,
    studentsFound: students.length,
    studentsSynced: synced,
    studentsSkipped: skipped,
    studentsFailed: failed,
    startedAt,
    completedAt,
    details,
  };

  console.log(
    `[HackerRank Sync] ✅ HackerRank monthly sync completed | month=${month} | ` +
    `synced=${synced} skipped=${skipped} failed=${failed}`
  );

  return summary;
}

function msUntilNextMonthlySync(): number {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 15, 0, 0); // 00:15
  const ms = target.getTime() - now.getTime();
  return ms > 0 ? ms : new Date(now.getFullYear(), now.getMonth() + 2, 1, 0, 15, 0, 0).getTime() - now.getTime();
}

export async function startHackerRankScheduler(): Promise<void> {
  console.log('[HackerRank Sync] 📅 Monthly HackerRank scheduler initialised');

  try {
    const month = currentMonth();
    const checkRes = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM student_hackerrank_snapshots WHERE snapshot_month=$1 AND sync_status='synced'`,
      [month]
    );
    const existingCount = parseInt(checkRes.rows[0]?.count ?? '0', 10);

    const eligibleRes = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM students WHERE hackerrank_url IS NOT NULL AND hackerrank_url != ''`
    );
    const eligibleCount = parseInt(eligibleRes.rows[0]?.count ?? '0', 10);

    if (eligibleCount > 0 && existingCount === 0) {
      const today = new Date();
      const isFirstOfMonth = today.getDate() === 1;
      if (isFirstOfMonth) {
        console.log(`[HackerRank Sync] 📌 First-of-month detected on startup — triggering immediate sync for ${month}`);
        runMonthlyHackerRankSync().catch((err) =>
          console.error('[HackerRank Sync] Startup sync error:', err.message)
        );
      }
    }
  } catch (err: any) {
    console.warn('[HackerRank Sync] Startup check failed:', err.message);
  }

  function scheduleNextRun(): void {
    const ms = Math.min(msUntilNextMonthlySync(), 2147483647);
    setTimeout(async () => {
      try {
        await runMonthlyHackerRankSync();
      } catch (err: any) {
        console.error('[HackerRank Sync] Monthly sync error:', err.message);
      }
      scheduleNextRun();
    }, ms);
  }

  scheduleNextRun();
}
