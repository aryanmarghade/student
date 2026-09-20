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

function extractHackerRankUsername(url: string): string | null {
  const match = url.match(/hackerrank\.com\/([^\/\s?#]+)/i);
  return match ? match[1] : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function syncOneStudent(
  student: { id: string; hackerrank_url: string | null; full_name: string; roll_number: string },
  month: string
): Promise<SnapshotSyncResult> {
  if (!student.hackerrank_url || !student.hackerrank_url.trim()) {
    return { studentId: student.id, username: null, status: 'not_synced' };
  }

  const username = extractHackerRankUsername(student.hackerrank_url);
  if (!username) {
    const errMsg = `Cannot parse HackerRank username from URL: ${student.hackerrank_url}`;
    console.error(`[HackerRank Sync] ❌ ${student.roll_number}: ${errMsg}`);
    return { studentId: student.id, username: null, status: 'failed', error: errMsg };
  }

  // No real integration is configured/available.
  // We do NOT create a fake snapshot and do NOT insert synthetic values.
  console.log(`[HackerRank Sync] ℹ️ ${student.roll_number} (${username}) — HackerRank integration not available.`);
  return { studentId: student.id, username, status: 'not_synced', error: 'Real HackerRank integration is not configured/available' };
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
    const ms = msUntilNextMonthlySync();
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
