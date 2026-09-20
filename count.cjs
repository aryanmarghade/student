const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:aryan@localhost:5432/vission_academy' });
async function count() {
  for (const t of ['student_github_snapshots', 'student_linkedin_snapshots', 'student_hackerrank_snapshots']) {
    try {
      const res = await pool.query(`SELECT COUNT(*) FROM ${t}`);
      console.log(`${t}: ${res.rows[0].count}`);
    } catch(e) {
      console.log(`${t}: error ${e.message}`);
    }
  }
  process.exit(0);
}
count();
