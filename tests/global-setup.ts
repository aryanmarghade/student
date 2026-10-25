import { setupTestDb } from '../scripts/setup-test-db.js';

export default async function globalSetup() {
  console.log('[Playwright Global Setup] Ensuring test database is initialized...');
  await setupTestDb();
}
