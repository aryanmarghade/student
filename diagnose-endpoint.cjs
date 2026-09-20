// Full admin route diagnosis - tests multiple endpoints to find real failure
const pg = require('./node_modules/pg');
const jwt = require('./node_modules/jsonwebtoken');
const http = require('http');

const DATABASE_URL = 'postgresql://postgres:aryan@localhost:5432/vission_academy';
const JWT_SECRET = 'super_secret_vission_academy_key_2026';

async function makeRequest(url, token, label) {
  return new Promise((resolve) => {
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    
    const req = http.get(url, { headers }, (res) => {
      const ct = res.headers['content-type'] || 'MISSING';
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        console.log('[' + label + ']');
        console.log('  STATUS:', res.statusCode);
        console.log('  CONTENT-TYPE:', ct);
        const preview = data.substring(0, 300);
        console.log('  BODY:', preview);
        resolve({ status: res.statusCode, ct, body: preview });
      });
    });
    req.on('error', e => {
      console.error('[' + label + '] ERROR:', e.message);
      resolve({ error: e.message });
    });
  });
}

async function run() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  
  console.log('=== DB: Query admin user ===');
  const userRes = await pool.query("SELECT id, email, role, full_name FROM users WHERE role='admin' LIMIT 1");
  const adminUser = userRes.rows[0];
  if (!adminUser) {
    console.log('ERROR: No admin user in DB');
    await pool.end();
    return;
  }
  console.log('Admin user found:', adminUser.email, '(role:', adminUser.role + ')');

  console.log('\n=== DB: analytics_visibility_settings ===');
  try {
    const visRes = await pool.query("SELECT * FROM analytics_visibility_settings");
    console.log('Table exists: YES, rows:', visRes.rowCount);
    if (visRes.rows[0]) console.log('Row:', JSON.stringify(visRes.rows[0]));
    else console.log('Table is EMPTY');
  } catch (e) {
    console.log('Table does NOT exist:', e.message);
  }

  await pool.end();

  // Generate admin token
  const adminToken = jwt.sign(
    { id: adminUser.id, email: adminUser.email, role: adminUser.role, full_name: adminUser.full_name },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  
  console.log('\n=== ENDPOINT TESTS WITH ADMIN TOKEN ===');
  
  // Test 1: No auth  
  console.log('\n--- Test 1: No auth ---');
  await makeRequest('http://localhost:3000/api/admin/analytics-visibility', null, 'NO AUTH');
  
  // Test 2: With admin token
  console.log('\n--- Test 2: With admin token (role=admin) ---');
  await makeRequest('http://localhost:3000/api/admin/analytics-visibility', adminToken, 'ADMIN TOKEN');

  // Test 3: Other admin endpoints to confirm routing works
  console.log('\n--- Test 3: /api/admin/overview (known working) ---');
  await makeRequest('http://localhost:3000/api/admin/overview', adminToken, 'ADMIN OVERVIEW');

  // Test 4: /api/admin/audit-logs
  console.log('\n--- Test 4: /api/admin/audit-logs ---');
  await makeRequest('http://localhost:3000/api/admin/audit-logs', adminToken, 'AUDIT LOGS');

  // Test 5: Direct test of PUT
  console.log('\n--- Test 5: Check /api/admin/users (same router) ---');
  await makeRequest('http://localhost:3000/api/admin/users', adminToken, 'USERS');
  
  console.log('\n=== DIAGNOSIS COMPLETE ===');
}

run().catch(console.error);
