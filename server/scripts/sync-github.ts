/**
 * server/scripts/sync-github.ts
 * --------------------------------
 * Standalone CLI script for manual / development GitHub sync.
 *
 * Usage:
 *   npm run sync:github
 *   npm run sync:github -- --month 2026-09
 *
 * This script is for development/testing ONLY.
 * Production syncs run automatically via the scheduler in server.ts.
 *
 * SECURITY:
 *   - Reads GITHUB_TOKEN from .env (never hardcoded)
 *   - Does NOT expose any GitHub token in its output
 */

import dotenv from 'dotenv';
dotenv.config();

import { initializeDatabase } from '../db.js';
import { runMonthlyGitHubSync } from '../github-sync.js';

async function main() {
  // Parse optional --month YYYY-MM argument
  const monthArg = process.argv.find((a) => /^\d{4}-\d{2}$/.test(a));
  const month = monthArg ?? undefined;

  console.log('═══════════════════════════════════════════════════════');
  console.log('  Vission Academy — GitHub Monthly Sync (manual run)');
  console.log(`  Month: ${month ?? 'current month'}`);
  console.log(`  GITHUB_TOKEN configured: ${!!(process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim())}`);
  console.log('═══════════════════════════════════════════════════════');

  try {
    await initializeDatabase();
    const result = await runMonthlyGitHubSync(month);

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  SYNC RESULT SUMMARY');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  Month:            ${result.month}`);
    console.log(`  Students found:   ${result.studentsFound}`);
    console.log(`  Synced:           ${result.studentsSynced}`);
    console.log(`  Skipped (no URL): ${result.studentsSkipped}`);
    console.log(`  Failed:           ${result.studentsFailed}`);
    console.log(`  Started at:       ${result.startedAt}`);
    console.log(`  Completed at:     ${result.completedAt}`);

    if (result.studentsFailed > 0) {
      console.log('\n  FAILED STUDENTS:');
      for (const d of result.details.filter((x) => x.status === 'failed')) {
        console.log(`    - Student ${d.studentId} (${d.username ?? 'unknown'}): ${d.error}`);
      }
    }

    console.log('\n  Run the following SQL to verify:');
    console.log(`  SELECT student_id, github_username, snapshot_month, sync_status, public_repos`);
    console.log(`  FROM student_github_snapshots`);
    console.log(`  WHERE snapshot_month = '${result.month}'`);
    console.log(`  ORDER BY student_id;`);
    console.log('═══════════════════════════════════════════════════════\n');

    process.exit(0);
  } catch (err: any) {
    console.error('\n[sync:github] Fatal error:', err.message || err);
    process.exit(1);
  }
}

main();
