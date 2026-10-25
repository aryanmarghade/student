const path = require('path');
const dotenv = require('dotenv');
const { execSync } = require('child_process');
const { Client } = require('pg');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL not found in .env');
  process.exit(1);
}

const backupDir = 'C:\\Users\\Aryan\\Downloads\\vission-academy-backups';
const dumpFile = path.join(backupDir, 'vission_academy_backup_pgdump.dump');
const sqlFile = path.join(backupDir, 'vission_academy_backup_pgdump.sql');
const pgDumpPath = 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe';
const pgRestorePath = 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_restore.exe';

async function run() {
  console.log('1. Executing pg_dump custom format...');
  execSync(`"${pgDumpPath}" --dbname="${dbUrl}" --format=custom --file="${dumpFile}"`, { stdio: 'inherit' });

  console.log('2. Executing pg_dump plain SQL format...');
  execSync(`"${pgDumpPath}" --dbname="${dbUrl}" --format=plain --file="${sqlFile}"`, { stdio: 'inherit' });

  const fs = require('fs');
  const dumpStat = fs.statSync(dumpFile);
  const sqlStat = fs.statSync(sqlFile);
  console.log(`Created dump file: ${dumpFile} (${dumpStat.size} bytes)`);
  console.log(`Created sql file: ${sqlFile} (${sqlStat.size} bytes)`);

  const parsedUrl = new URL(dbUrl);
  const mainDbName = parsedUrl.pathname.replace('/', '');
  const throwawayDb = 'vission_restore_test_' + Date.now();

  const adminClient = new Client({ connectionString: dbUrl });
  await adminClient.connect();

  console.log(`3. Creating throwaway database ${throwawayDb}...`);
  await adminClient.query(`CREATE DATABASE "${throwawayDb}"`);

  parsedUrl.pathname = '/' + throwawayDb;
  const throwawayUrl = parsedUrl.toString();

  try {
    console.log(`4. Restoring dump into throwaway database ${throwawayDb}...`);
    execSync(`"${pgRestorePath}" --dbname="${throwawayUrl}" --no-owner --no-privileges "${dumpFile}"`, { stdio: 'inherit' });

    console.log('5. Verifying restored data counts...');
    const testClient = new Client({ connectionString: throwawayUrl });
    await testClient.connect();

    const usersRes = await testClient.query('SELECT count(*) FROM users');
    const studentsRes = await testClient.query('SELECT count(*) FROM students');
    const marksRes = await testClient.query('SELECT count(*) FROM marks');
    const tablesRes = await testClient.query("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'");

    console.log('Verification Success:');
    console.log(` - Tables restored: ${tablesRes.rows[0].count}`);
    console.log(` - Users restored: ${usersRes.rows[0].count}`);
    console.log(` - Students restored: ${studentsRes.rows[0].count}`);
    console.log(` - Marks records restored: ${marksRes.rows[0].count}`);

    await testClient.end();
  } finally {
    console.log(`6. Cleaning up throwaway database ${throwawayDb}...`);
    await adminClient.query(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = '${throwawayDb}' AND pid <> pg_backend_pid()
    `);
    await adminClient.query(`DROP DATABASE IF EXISTS "${throwawayDb}"`);
    await adminClient.end();
    console.log('Cleanup complete.');
  }
}

run().catch(err => {
  console.error('Error during backup verification:', err);
  process.exit(1);
});
