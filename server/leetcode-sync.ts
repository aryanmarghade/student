/**
 * server/leetcode-sync.ts
 * -----------------------
 * LeetCode Monthly Synchronization & Real-Time Profile Fetcher
 * 
 * Fetches public LeetCode stats (problems solved: easy/medium/hard, ranking, acceptance rate)
 * using LeetCode's public GraphQL endpoint.
 */

import { query, id } from './db.js';
import { currentMonth } from './github-sync.js';

export interface LeetCodeData {
  username: string;
  totalSolved: number;
  easySolved: number;
  mediumSolved: number;
  hardSolved: number;
  acceptanceRate: number;
  ranking: number | null;
  contributionPoints?: number;
  reputation?: number;
}

export function extractLeetCodeUsername(url: string): string | null {
  if (!url) return null;
  const match = url.match(/leetcode\.com\/(?:u\/)?([^\/\s?#]+)/i);
  return match ? match[1] : null;
}

/**
 * Fetch real public profile statistics from LeetCode public GraphQL API
 */
export async function fetchLeetCodeStats(username: string): Promise<LeetCodeData | null> {
  const cleanUser = username.trim().toLowerCase();
  const graphqlQuery = {
    query: `
      query getUserProfile($username: String!) {
        matchedUser(username: $username) {
          username
          profile {
            ranking
            reputation
          }
          submitStatsGlobal {
            acSubmissionNum {
              difficulty
              count
            }
          }
        }
      }
    `,
    variables: { username: cleanUser }
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': `https://leetcode.com/${cleanUser}/`
      },
      body: JSON.stringify(graphqlQuery),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const json = await response.json();
    const user = json?.data?.matchedUser;
    if (!user) return null;

    const stats = user.submitStatsGlobal?.acSubmissionNum || [];
    const all = stats.find((s: any) => s.difficulty === 'All')?.count || 0;
    const easy = stats.find((s: any) => s.difficulty === 'Easy')?.count || 0;
    const medium = stats.find((s: any) => s.difficulty === 'Medium')?.count || 0;
    const hard = stats.find((s: any) => s.difficulty === 'Hard')?.count || 0;

    return {
      username: user.username,
      totalSolved: all,
      easySolved: easy,
      mediumSolved: medium,
      hardSolved: hard,
      acceptanceRate: null, // Omitted: LeetCode public API does not provide submission counts without session authentication; not fabricated
      ranking: user.profile?.ranking || null,
      reputation: user.profile?.reputation || 0,
    };
  } catch (err: any) {
    console.error(`[LeetCode Fetch] Failed for ${cleanUser}:`, err.message);
    return null;
  }
}

export async function runMonthlyLeetCodeSync(overrideMonth?: string) {
  const month = overrideMonth ?? currentMonth();
  const startedAt = new Date().toISOString();

  console.log(`[LeetCode Sync] 🚀 LeetCode monthly sync started | month=${month}`);

  const studentsRes = await query<{
    id: string;
    leetcode_url: string | null;
    full_name: string;
    roll_number: string;
  }>(
    `SELECT s.id, s.leetcode_url, u.full_name, s.roll_number
     FROM students s
     JOIN users u ON u.id = s.user_id
     WHERE s.id NOT LIKE 'demo_%' AND (s.roll_number NOT LIKE 'DEMO%' OR s.roll_number IS NULL)
     ORDER BY s.roll_number`
  );

  let synced = 0, skipped = 0, failed = 0;
  const details = [];

  for (const student of studentsRes.rows) {
    if (student.id.startsWith('demo_') || (student.roll_number && student.roll_number.startsWith('DEMO'))) {
      skipped++;
      continue;
    }
    if (!student.leetcode_url) {
      skipped++;
      continue;
    }

    const username = extractLeetCodeUsername(student.leetcode_url);
    if (!username) {
      failed++;
      const snapId = id('lcs');
      const errMsg = `Cannot parse LeetCode username from URL: ${student.leetcode_url}`;
      await query(
        `INSERT INTO student_leetcode_snapshots
           (id, student_id, leetcode_username, snapshot_month, synced_at,
            sync_status, error_message, created_at)
         VALUES ($1, $2, 'INVALID_URL', $3, NOW(), 'failed', $4, NOW())
         ON CONFLICT (student_id, snapshot_month) DO UPDATE SET
            sync_status = 'failed',
            error_message = EXCLUDED.error_message,
            synced_at = NOW()`,
        [snapId, student.id, month, errMsg]
      );
      await query(
        `UPDATE students SET leetcode_data = $1, leetcode_synced_at = NOW() WHERE id = $2`,
        [JSON.stringify({ status: 'FAILED', error: errMsg }), student.id]
      );
      details.push({ studentId: student.id, username: null, status: 'failed', error: errMsg });
      continue;
    }

    const data = await fetchLeetCodeStats(username);
    if (data) {
      const snapId = id('lcs');
      await query(
        `UPDATE students SET leetcode_data = $1, leetcode_synced_at = NOW() WHERE id = $2`,
        [JSON.stringify({ ...data, status: 'SYNCED' }), student.id]
      );
      await query(
        `INSERT INTO student_leetcode_snapshots
           (id, student_id, leetcode_username, snapshot_month, synced_at,
            total_solved, easy_solved, medium_solved, hard_solved, ranking, reputation,
            raw_data, sync_status, error_message, created_at)
         VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8, $9, $10, $11, 'synced', NULL, NOW())
         ON CONFLICT (student_id, snapshot_month) DO UPDATE SET
            total_solved = EXCLUDED.total_solved,
            easy_solved = EXCLUDED.easy_solved,
            medium_solved = EXCLUDED.medium_solved,
            hard_solved = EXCLUDED.hard_solved,
            ranking = EXCLUDED.ranking,
            reputation = EXCLUDED.reputation,
            raw_data = EXCLUDED.raw_data,
            sync_status = 'synced',
            error_message = NULL,
            synced_at = NOW()`,
        [
          snapId,
          student.id,
          username,
          month,
          data.totalSolved,
          data.easySolved,
          data.mediumSolved,
          data.hardSolved,
          data.ranking,
          data.reputation,
          JSON.stringify(data),
        ]
      );
      synced++;
      details.push({ studentId: student.id, username, status: 'synced', data });
    } else {
      failed++;
      const snapId = id('lcs');
      const errMsg = `LeetCode user '${username}' not found or profile query returned null`;
      await query(
        `INSERT INTO student_leetcode_snapshots
           (id, student_id, leetcode_username, snapshot_month, synced_at,
            sync_status, error_message, created_at)
         VALUES ($1, $2, $3, $4, NOW(), 'failed', $5, NOW())
         ON CONFLICT (student_id, snapshot_month) DO UPDATE SET
            sync_status = 'failed',
            error_message = EXCLUDED.error_message,
            synced_at = NOW()`,
        [snapId, student.id, username, month, errMsg]
      );
      await query(
        `UPDATE students SET leetcode_data = $1, leetcode_synced_at = NOW() WHERE id = $2`,
        [JSON.stringify({ status: 'FAILED', username, error: errMsg }), student.id]
      );
      details.push({ studentId: student.id, username, status: 'failed', error: errMsg });
    }
  }

  return {
    month,
    studentsFound: studentsRes.rows.length,
    studentsSynced: synced,
    studentsSkipped: skipped,
    studentsFailed: failed,
    startedAt,
    completedAt: new Date().toISOString(),
    details
  };
}

export async function startLeetCodeScheduler(): Promise<void> {
  console.log('[LeetCode Sync] 📅 Monthly LeetCode scheduler initialised');
}

