const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const pool = new Pool({
  connectionString: 'postgresql://postgres:aryan@localhost:5432/vission_academy'
});

async function run() {
  const adminRes = await pool.query(`SELECT id, email, role, full_name FROM users WHERE role = 'admin' LIMIT 1`);
  const admin = adminRes.rows[0];
  const token = jwt.sign(
    { id: admin.id, role: admin.role, email: admin.email, full_name: admin.full_name },
    process.env.JWT_SECRET || 'super_secret_vission_academy_key_2026',
    { expiresIn: '1h' }
  );

  const endpoints = [
    '/api/admin/linkedin/sync',
    '/api/admin/hackerrank/sync',
    '/api/admin/github/sync'
  ];

  for (const ep of endpoints) {
    console.log(`\nTesting ${ep}`);
    try {
      const res = await fetch(`http://localhost:3000${ep}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log(`Status: ${res.status}`);
      console.log(`Content-Type: ${res.headers.get('content-type')}`);
      const text = await res.text();
      console.log(`Body: ${text.substring(0, 500)}`);
    } catch (e) {
      console.log(`Error: ${e.message}`);
    }
  }

  process.exit(0);
}
run();
