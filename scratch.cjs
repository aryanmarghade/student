const { hashPassword, comparePassword } = require('./dist/auth.cjs');
const { query } = require('./dist/db.cjs');

async function test() {
  try {
    const hash = await hashPassword('password123');
    console.log("Hash:", hash);
    const result = await query("UPDATE users SET password_hash=$1 WHERE role='student' RETURNING id, email, password_hash LIMIT 1", [hash]);
    console.log("Update result:", result.rows);
    
    if (result.rows.length > 0) {
      const match = await comparePassword('password123', result.rows[0].password_hash);
      console.log("Match:", match);
    }
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}
test();
