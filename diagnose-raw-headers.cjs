// Raw header inspection for the 404 routes
const pg = require('./node_modules/pg');
const jwt = require('./node_modules/jsonwebtoken');
const http = require('http');

const pool = new pg.Pool({ connectionString: 'postgresql://postgres:aryan@localhost:5432/vission_academy' });
pool.query("SELECT id,email,role FROM users WHERE role='admin' LIMIT 1").then(r => {
  pool.end();
  const u = r.rows[0];
  const token = jwt.sign({ id: u.id, email: u.email, role: u.role }, 'super_secret_vission_academy_key_2026', { expiresIn: '1h' });
  const body = JSON.stringify({});

  function test(path) {
    return new Promise(resolve => {
      const opts = {
        hostname: 'localhost', port: 3000, path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'Authorization': 'Bearer ' + token }
      };
      const req = http.request(opts, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          console.log('PATH:', path);
          console.log('  STATUS:', res.statusCode);
          console.log('  HEADERS:', JSON.stringify(res.headers));
          console.log('  BODY-LEN:', d.length);
          console.log('  BODY:', JSON.stringify(d.substring(0, 300)));
          resolve();
        });
      });
      req.on('error', e => { console.log('PATH:', path, 'SOCKET ERROR:', e.message, e.code); resolve(); });
      req.write(body); req.end();
    });
  }

  Promise.resolve()
    .then(() => test('/api/admin/github/sync'))
    .then(() => test('/api/admin/linkedin/sync'))
    .then(() => test('/api/admin/hackerrank/sync'))
    .then(() => test('/api/admin/analytics/sync-all'));
}).catch(e => console.error(e));
