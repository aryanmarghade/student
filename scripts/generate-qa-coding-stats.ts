import dotenv from 'dotenv';
import path from 'path';
import { generateQaCodingStats } from '../server/qa-coding-stats-generator.js';

dotenv.config({ path: path.resolve(process.cwd(), process.env.DOTENV_CONFIG_PATH || '.env') });

async function main() {
  const args = process.argv.slice(2);
  let runName: string | undefined;
  let studentId: string | undefined;
  let runId: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--name' && args[i + 1]) {
      runName = args[++i];
    } else if (args[i] === '--student' && args[i + 1]) {
      studentId = args[++i];
    } else if (args[i] === '--run-id' && args[i + 1]) {
      runId = args[++i];
    }
  }

  console.log('[CLI] Generating QA coding statistics...');
  const summary = await generateQaCodingStats({ runName, studentId, runId });
  console.log('[CLI] Summary:', JSON.stringify(summary, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error('[CLI] Failed to generate QA coding stats:', err);
  process.exit(1);
});
