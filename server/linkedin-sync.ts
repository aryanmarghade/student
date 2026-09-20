/**
 * server/linkedin-sync.ts
 * -----------------------
 * LinkedIn Monthly Synchronization Service
 * 
 * Simulates fetching public LinkedIn profile data for students and stores historical
 * monthly snapshots in PostgreSQL. Historical rows are NEVER overwritten.
 */

import { query, id } from './db.js';
import { currentMonth } from './github-sync.js';

export interface LinkedInSnapshotData {
  connections: number | null;
  posts_count: number | null;
  followers: number | null;
}

export interface SnapshotSyncResult {
  studentId: string;
  url: string | null;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function syncOneStudent(
  student: { id: string; linkedin_url: string | null; full_name: string; roll_number: string },
  month: string
): Promise<SnapshotSyncResult> {
  if (!student.linkedin_url || !student.linkedin_url.trim()) {
    return { studentId: student.id, url: null, status: 'not_synced' };
  }

  const url = student.linkedin_url.trim();

  // No real integration is configured/available.
  // We do NOT create a fake snapshot and do NOT insert synthetic values.
  console.log(`[LinkedIn Sync] ℹ️ ${student.roll_number} — LinkedIn integration not available for ${url}`);
  return { studentId: student.id, url, status: 'not_synced', error: 'Real LinkedIn integration is not configured/available' };
}

async function upsertSnapshot(opts: {
  studentId: string;
  linkedinUrl: string;
  month: string;
  data: LinkedInSnapshotData | null;
  status: 'synced' | 'failed' | 'not_synced';
  error: string | undefined;
}): Promise<void> {
  const snapshotId = id('lis');
  const now = new Date().toISOString();

  await query(
    `INSERT INTO student_linkedin_snapshots
       (id, student_id, linkedin_url, snapshot_month, synced_at,
        connections, posts_count, followers,
        raw_data, sync_status, error_message, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (student_id, snapshot_month) DO UPDATE SET
       linkedin_url        = EXCLUDED.linkedin_url,
       synced_at           = EXCLUDED.synced_at,
       connections         = EXCLUDED.connections,
       posts_count         = EXCLUDED.posts_count,
       followers           = EXCLUDED.followers,
       raw_data            = EXCLUDED.raw_data,
       sync_status         = EXCLUDED.sync_status,
       error_message       = EXCLUDED.error_message`,
    [
      snapshotId,
      opts.studentId,
      opts.linkedinUrl,
      opts.month,
      now,
      opts.data?.connections ?? null,
      opts.data?.posts_count ?? null,
      opts.data?.followers ?? null,
      opts.data ? JSON.stringify(opts.data) : null,
      opts.status,
      opts.error ?? null,
      now,
    ]
  );
}

export async function runMonthlyLinkedInSync(overrideMonth?: string): Promise<MonthlySyncResult> {
  const month = overrideMonth ?? currentMonth();
  const startedAt = new Date().toISOString();

  console.log(`[LinkedIn Sync] 🚀 LinkedIn monthly sync started | month=${month}`);

  const studentsRes = await query<{
    id: string;
    linkedin_url: string | null;
    full_name: string;
    roll_number: string;
  }>(
    `SELECT s.id, s.linkedin_url, u.full_name, s.roll_number
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
    `[LinkedIn Sync] ✅ LinkedIn monthly sync completed | month=${month} | ` +
    `synced=${synced} skipped=${skipped} failed=${failed}`
  );

  return summary;
}

function msUntilNextMonthlySync(): number {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 10, 0, 0); // 00:10 to offset from github sync
  const ms = target.getTime() - now.getTime();
  return ms > 0 ? ms : new Date(now.getFullYear(), now.getMonth() + 2, 1, 0, 10, 0, 0).getTime() - now.getTime();
}

export async function startLinkedInScheduler(): Promise<void> {
  console.log('[LinkedIn Sync] 📅 Monthly LinkedIn scheduler initialised');

  try {
    const month = currentMonth();
    const checkRes = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM student_linkedin_snapshots WHERE snapshot_month=$1 AND sync_status='synced'`,
      [month]
    );
    const existingCount = parseInt(checkRes.rows[0]?.count ?? '0', 10);

    const eligibleRes = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM students WHERE linkedin_url IS NOT NULL AND linkedin_url != ''`
    );
    const eligibleCount = parseInt(eligibleRes.rows[0]?.count ?? '0', 10);

    if (eligibleCount > 0 && existingCount === 0) {
      const today = new Date();
      const isFirstOfMonth = today.getDate() === 1;
      if (isFirstOfMonth) {
        console.log(`[LinkedIn Sync] 📌 First-of-month detected on startup — triggering immediate sync for ${month}`);
        runMonthlyLinkedInSync().catch((err) =>
          console.error('[LinkedIn Sync] Startup sync error:', err.message)
        );
      }
    }
  } catch (err: any) {
    console.warn('[LinkedIn Sync] Startup check failed:', err.message);
  }

  function scheduleNextRun(): void {
    const ms = msUntilNextMonthlySync();
    setTimeout(async () => {
      try {
        await runMonthlyLinkedInSync();
      } catch (err: any) {
        console.error('[LinkedIn Sync] Monthly sync error:', err.message);
      }
      scheduleNextRun();
    }, ms);
  }

  scheduleNextRun();
}
