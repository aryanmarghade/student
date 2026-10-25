import { test, expect } from '@playwright/test';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { Pool } from 'pg';
import JSZip from 'jszip';
import zlib from 'zlib';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const BASE_URL = 'http://127.0.0.1:3000';
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is missing from environment.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

let adminUser: any;
let adminToken: string;
let studentUser: any;
let studentToken: string;
let otherStudentUser: any;
let otherStudentToken: string;
let activeSemester: any;

test.beforeAll(async () => {
  const [adminRes, studentsRes, semRes] = await Promise.all([
    pool.query(`SELECT id, email, role, full_name FROM users WHERE role='admin' LIMIT 1`),
    pool.query(`
      SELECT s.id as student_id, s.roll_number, u.id, u.email, u.role, u.full_name
      FROM students s
      JOIN users u ON u.id = s.user_id
      ORDER BY s.roll_number ASC
      LIMIT 2
    `),
    pool.query(`SELECT id, name FROM semesters WHERE is_active = true LIMIT 1`),
  ]);

  adminUser = adminRes.rows[0];
  studentUser = studentsRes.rows[0];
  otherStudentUser = studentsRes.rows[1];
  activeSemester = semRes.rows[0];

  adminToken = jwt.sign(
    { id: adminUser.id, email: adminUser.email, role: adminUser.role, full_name: adminUser.full_name },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  studentToken = jwt.sign(
    { id: studentUser.id, email: studentUser.email, role: studentUser.role, full_name: studentUser.full_name },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  otherStudentToken = jwt.sign(
    { id: otherStudentUser.id, email: otherStudentUser.email, role: otherStudentUser.role, full_name: otherStudentUser.full_name },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
});

test.afterAll(async () => {
  await pool.end();
});

test.describe('Phase 2B: Authenticated Marksheet Downloads & IDOR Protection', () => {
  let createdMarksheetId: string;

  test.beforeAll(async () => {
    // Ensure test marksheet exists for studentUser
    const marksheetFile = path.join(process.cwd(), 'uploads', 'marksheets', 'test-fixture.pdf');
    if (!fs.existsSync(marksheetFile)) {
      fs.writeFileSync(marksheetFile, '%PDF-1.4 test marksheet content');
    }

    const insRes = await pool.query(
      `INSERT INTO marksheets (id, student_id, semester_id, file_url, file_name, sgpa, cgpa, uploaded_by)
       VALUES ('ms_test_p2b_01', $1, $2, '/uploads/marksheets/test-fixture.pdf', 'test-fixture.pdf', 9.2, 9.1, $3)
       ON CONFLICT (id) DO UPDATE SET student_id = $1
       RETURNING id`,
      [studentUser.student_id, activeSemester.id, adminUser.id]
    );
    createdMarksheetId = insRes.rows[0].id;
  });

  test.afterAll(async () => {
    await pool.query(`DELETE FROM marksheets WHERE id = 'ms_test_p2b_01'`);
  });

  test('Direct unauthenticated access to /uploads/marksheets/... is blocked (401 or 404)', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/uploads/marksheets/test-fixture.pdf`);
    // Direct static route must not return the file contents
    expect([401, 403, 404]).toContain(res.status());
  });

  test('Student can download their own marksheet via authenticated endpoint', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/student/marksheets/${createdMarksheetId}/file`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('pdf');
  });

  test('Other student cannot download marksheet belonging to different student (IDOR protected: 403 or 404)', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/student/marksheets/${createdMarksheetId}/file`, {
      headers: { Authorization: `Bearer ${otherStudentToken}` },
    });
    expect([403, 404]).toContain(res.status());
  });
});

test.describe('Phase 2B: Single PDF Marksheet Upload Limits & Validation', () => {
  test('Single upload rejects non-PDF file extension and MIME type with 400', async ({ request }) => {
    const fakeText = Buffer.from('hello world not a pdf');
    const res = await request.post(`${BASE_URL}/api/admin/marksheets/upload`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      multipart: {
        student_id: studentUser.student_id,
        semester_id: activeSemester.id,
        sgpa: '8.5',
        cgpa: '8.5',
        file: {
          name: 'malicious.txt',
          mimeType: 'text/plain',
          buffer: fakeText,
        },
      },
    });
    expect(res.status()).toBe(400);
  });

  test('Single upload rejects fake PDF lacking %PDF- magic bytes with 400', async ({ request }) => {
    const fakePdfBytes = Buffer.from('NOT_MAGIC_BYTES_AT_ALL');
    const res = await request.post(`${BASE_URL}/api/admin/marksheets/upload`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      multipart: {
        student_id: studentUser.student_id,
        semester_id: activeSemester.id,
        sgpa: '8.5',
        cgpa: '8.5',
        file: {
          name: 'fake.pdf',
          mimeType: 'application/pdf',
          buffer: fakePdfBytes,
        },
      },
    });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/valid.*pdf/i);
  });

  test('Single upload rejects file exceeding 10MB limit with 400 or 413', async ({ request }) => {
    // 10.5 MB buffer starting with %PDF-
    const oversizedBuffer = Buffer.alloc(10.5 * 1024 * 1024);
    oversizedBuffer.write('%PDF-1.4 header');
    const res = await request.post(`${BASE_URL}/api/admin/marksheets/upload`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      multipart: {
        student_id: studentUser.student_id,
        semester_id: activeSemester.id,
        sgpa: '8.5',
        cgpa: '8.5',
        file: {
          name: 'oversized.pdf',
          mimeType: 'application/pdf',
          buffer: oversizedBuffer,
        },
      },
    });
    expect([400, 413]).toContain(res.status());
  });
});

test.describe('Phase 2B: Bulk ZIP Archive Protection (Zip-Slip & Zip-Bomb Defenses)', () => {
  test('Bulk ZIP upload rejects zip-slip path traversal entry (e.g. ../../slip.pdf)', async ({ request }) => {
    const zip = new JSZip();
    // Valid PDF content
    const validPdf = Buffer.from('%PDF-1.4 valid marksheet bytes');
    // Malicious traversal filename targeting outside root
    zip.file('../../etc/slip.pdf', validPdf);
    zip.file('..\\..\\slip_win.pdf', validPdf);

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    const res = await request.post(`${BASE_URL}/api/admin/marksheets/bulk-zip`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      multipart: {
        semester_id: activeSemester.id,
        file: {
          name: 'zipslip.zip',
          mimeType: 'application/zip',
          buffer: zipBuffer,
        },
      },
    });

    // Must be rejected with 400 or skipped with security error, never written to disk outside uploadDir
    if (res.status() === 200) {
      const json = await res.json();
      const hasSlipSaved = json.details?.some((d: any) =>
        d.file.includes('..') && d.status === 'saved'
      );
      expect(hasSlipSaved).toBeFalsy();
    } else {
      expect([400, 403]).toContain(res.status());
    }
  });

  test('Bulk ZIP upload rejects archive with too many entries (>1000 files) with 400', async ({ request }) => {
    const zip = new JSZip();
    const tinyPdf = Buffer.from('%PDF-1.4 test');
    // Add 1005 files
    for (let i = 0; i < 1005; i++) {
      zip.file(`STUDENT_${i}.pdf`, tinyPdf);
    }
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    const res = await request.post(`${BASE_URL}/api/admin/marksheets/bulk-zip`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      multipart: {
        semester_id: activeSemester.id,
        file: {
          name: 'entry_bomb.zip',
          mimeType: 'application/zip',
          buffer: zipBuffer,
        },
      },
    });

    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/entry.*limit|too many files/i);
  });

  test('Bulk ZIP upload safely rejects uncompressed-size bomb (>200MB expansion) with 400', async ({ request }) => {
    // Generate an in-memory zip bomb fixture: highly compressible repeated zeroes
    const zip = new JSZip();
    // 250MB buffer of repeated zeroes (compresses down to <100KB)
    const largeBuffer = Buffer.alloc(250 * 1024 * 1024);
    largeBuffer.write('%PDF-1.4');
    zip.file(`${studentUser.roll_number}.pdf`, largeBuffer, { compression: 'DEFLATE', compressionOptions: { level: 9 } });

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    const res = await request.post(`${BASE_URL}/api/admin/marksheets/bulk-zip`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      multipart: {
        semester_id: activeSemester.id,
        file: {
          name: 'uncompressed_bomb.zip',
          mimeType: 'application/zip',
          buffer: zipBuffer,
        },
      },
    });

    expect([400, 413]).toContain(res.status());
    const json = await res.json();
    expect(json.error).toMatch(/uncompressed.*size|exceeds.*limit|size.*limit/i);
  });

  test('Bulk ZIP upload rejects entries containing backslashes, drive letters, null bytes, or absolute paths', async ({ request }) => {
    // 1. Backslash entry
    const zipBackslash = new JSZip();
    zipBackslash.file('sub\\folder.pdf', Buffer.from('%PDF-1.4 test'));
    const bufBackslash = await zipBackslash.generateAsync({ type: 'nodebuffer' });

    const resBackslash = await request.post(`${BASE_URL}/api/admin/marksheets/bulk-zip`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      multipart: {
        semester_id: activeSemester.id,
        file: { name: 'backslash.zip', mimeType: 'application/zip', buffer: bufBackslash },
      },
    });
    expect(resBackslash.status()).toBe(400);
    const jsonBs = await resBackslash.json();
    expect(jsonBs.error).toMatch(/illegal.*name|security violation|backslash|rejected/i);

    // 2. Drive letter entry (e.g. C:test.pdf)
    const zipDrive = new JSZip();
    zipDrive.file('C:test.pdf', Buffer.from('%PDF-1.4 test'));
    const bufDrive = await zipDrive.generateAsync({ type: 'nodebuffer' });

    const resDrive = await request.post(`${BASE_URL}/api/admin/marksheets/bulk-zip`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      multipart: {
        semester_id: activeSemester.id,
        file: { name: 'drive.zip', mimeType: 'application/zip', buffer: bufDrive },
      },
    });
    expect(resDrive.status()).toBe(400);
    const jsonDrive = await resDrive.json();
    expect(jsonDrive.error).toMatch(/illegal.*name|security violation|drive letter|rejected/i);

    // 3. Absolute path entry (e.g. /etc/test.pdf)
    const zipAbs = new JSZip();
    zipAbs.file('/root/test.pdf', Buffer.from('%PDF-1.4 test'));
    const bufAbs = await zipAbs.generateAsync({ type: 'nodebuffer' });

    const resAbs = await request.post(`${BASE_URL}/api/admin/marksheets/bulk-zip`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      multipart: {
        semester_id: activeSemester.id,
        file: { name: 'abs.zip', mimeType: 'application/zip', buffer: bufAbs },
      },
    });
    expect(resAbs.status()).toBe(400);
    const jsonAbs = await resAbs.json();
    expect(jsonAbs.error).toMatch(/illegal.*name|security violation|absolute|rejected/i);
  });

  test('Bulk ZIP upload rejects zip fixture whose central directory header lies about uncompressed size', async ({ request }) => {
    const zip = new JSZip();
    const pdfData = Buffer.from('%PDF-1.4 ' + 'A'.repeat(5000));
    zip.file(`${studentUser.roll_number}.pdf`, pdfData, { compression: 'STORE' });
    const zipBuf = await zip.generateAsync({ type: 'nodebuffer' });

    // Tamper with Central Directory header to lie about uncompressed size: set to 10 bytes instead of >5000
    const cdIdx = zipBuf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    expect(cdIdx).toBeGreaterThan(0);
    // Offset 24 in Central Directory header is uncompressed size (uint32 LE)
    zipBuf.writeUInt32LE(10, cdIdx + 24);

    const res = await request.post(`${BASE_URL}/api/admin/marksheets/bulk-zip`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      multipart: {
        semester_id: activeSemester.id,
        file: { name: 'lying_cd_header.zip', mimeType: 'application/zip', buffer: zipBuf },
      },
    });

    // Server must reject or report failure on extraction, never blindly trusting declared size
    const json = await res.json();
    if (res.status() === 200) {
      const saved = json.details?.some((d: any) => d.status === 'saved');
      expect(saved).toBeFalsy();
    } else {
      expect([400, 422]).toContain(res.status());
    }
  });
});
