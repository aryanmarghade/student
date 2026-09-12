import pg from 'pg';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function init() {
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'db/schema.sql'), 'utf8');
    const seed = fs.readFileSync(path.join(__dirname, 'db/seed.sql'), 'utf8');
    console.log('Running schema...');
    await pool.query(schema);
    console.log('Running seed...');
    await pool.query(seed);
    console.log('Database initialized successfully.');
  } catch (e) {
    console.error('Error initializing database', e);
  } finally {
    pool.end();
  }
}

init();
