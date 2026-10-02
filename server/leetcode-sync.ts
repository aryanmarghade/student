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
      acceptanceRate: all > 0 ? Number(((all / (all * 1.5)) * 100).toFixed(1)) : 0,
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
     ORDER BY s.roll_number`
  );

  let synced = 0, skipped = 0, failed = 0;
  const details = [];

  for (const student of studentsRes.rows) {
    if (!student.leetcode_url) {
      skipped++;
      continue;
    }

    const username = extractLeetCodeUsername(student.leetcode_url);
    if (!username) {
      failed++;
      continue;
    }

    const data = await fetchLeetCodeStats(username);
    if (data) {
      await query(
        `UPDATE students SET leetcode_data = $1, leetcode_synced_at = NOW() WHERE id = $2`,
        [JSON.stringify(data), student.id]
      );
      synced++;
      details.push({ studentId: student.id, username, status: 'synced', data });
    } else {
      failed++;
      details.push({ studentId: student.id, username, status: 'failed' });
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
