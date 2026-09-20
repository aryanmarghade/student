// Diagnosis only — no code changes. Tests POST routes to compare GitHub vs others.
const pg = require('./node_modules/pg');
const jwt = require('./node_modules/jsonwebtoken');
const http = require('http');

const DATABASE_URL = 'postgresql://postgres:aryan@localhost:5432/vission_academy';
const JWT_SECRET = 'super_secret_vission_academy_key_2026';

function makePost(path, token) {
  return new Promise((resolve) => {
    const body = JSON.stringify({});
    const opts = {
      hostname: 'localhost',
      port: 3000,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      const ct = res.headers['content-type'] || 'MISSING';
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, ct, body: data.substring(0, 400) }));
    });
    req.on('error', e => resolve({ error: e.message }));
    req.write(body);
    req.end();
  });
}

function makeGet(path, token) {
  return new Promise((resolve) => {
    const opts = {
      hostname: 'localhost',
      port: 3000,
      path,
      method: 'GET',
      headers: token ? { Authorization: 'Bearer ' + token } : {},
    };
    const req = http.request(opts, (res) => {
      const ct = res.headers['content-type'] || 'MISSING';
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, ct, body: data.substring(0, 400) }));
    });
    req.on('error', e => resolve({ error: e.message }));
    req.end();
  });
}

async function run() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const userRes = await pool.query("SELECT id, email, role FROM users WHERE role='admin' LIMIT 1");
  const adminUser = userRes.rows[0];
  await pool.end();

  if (!adminUser) { console.log('ERROR: No admin user'); return; }
  console.log('Admin user:', adminUser.email, '(role:', adminUser.role + ')');

  const token = jwt.sign(
    { id: adminUser.id, email: adminUser.email, role: adminUser.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  console.log('\n========== POST TESTS WITH ADMIN TOKEN ==========');

  const endpoints = [
    { label: 'GitHub POST /api/admin/github/sync',       path: '/api/admin/github/sync',        method: 'POST' },
    { label: 'LinkedIn POST /api/admin/linkedin/sync',   path: '/api/admin/linkedin/sync',      method: 'POST' },
    { label: 'HackerRank POST /api/admin/hackerrank/sync', path: '/api/admin/hackerrank/sync',  method: 'POST' },
    { label: 'Sync-All POST /api/admin/analytics/sync-all', path: '/api/admin/analytics/sync-all', method: 'POST' },
  ];

  for (const ep of endpoints) {
    const r = await makePost(ep.path, token);
    console.log('\n--- ' + ep.label + ' ---');
    console.log('  STATUS:', r.status || 'ERROR:' + r.error);
    console.log('  CONTENT-TYPE:', r.ct || 'n/a');
    console.log('  BODY:', r.body || r.error);
  }

  console.log('\n========== GET CHECK: Do routes exist at all? ==========');
  // Try GETting the same paths to see if they exist (wrong method → 404 means route doesn't exist; → Method Not Allowed = exists)
  const getTests = [
    { label: 'GET /api/admin/github/sync',        path: '/api/admin/github/sync' },
    { label: 'GET /api/admin/linkedin/sync',      path: '/api/admin/linkedin/sync' },
    { label: 'GET /api/admin/hackerrank/sync',    path: '/api/admin/hackerrank/sync' },
    { label: 'GET /api/admin/analytics/sync-all', path: '/api/admin/analytics/sync-all' },
  ];

  for (const ep of getTests) {
    const r = await makeGet(ep.path, token);
    console.log('\n--- ' + ep.label + ' ---');
    console.log('  STATUS:', r.status || 'ERROR:' + r.error);
    console.log('  BODY:', r.body || r.error);
  }

  console.log('\n========== DIAGNOSIS COMPLETE ==========');
}

run().catch(console.error);
