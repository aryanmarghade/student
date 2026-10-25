import { test, expect } from '@playwright/test';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { Pool } from 'pg';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const BASE_URL = 'http://127.0.0.1:3000';
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is missing from environment.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

let studentUser: any;
let studentToken: string;
let otherStudentUser: any;
let otherStudentToken: string;

test.beforeAll(async () => {
  const studentsRes = await pool.query(`
    SELECT s.id as student_id, s.user_id, s.roll_number, u.email, u.role, u.full_name
    FROM students s
    JOIN users u ON u.id = s.user_id
    ORDER BY s.roll_number ASC
    LIMIT 2
  `);

  studentUser = studentsRes.rows[0];
  otherStudentUser = studentsRes.rows[1];

  studentToken = jwt.sign(
    { id: studentUser.user_id, email: studentUser.email, role: 'student', full_name: studentUser.full_name },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  otherStudentToken = jwt.sign(
    { id: otherStudentUser.user_id, email: otherStudentUser.email, role: 'student', full_name: otherStudentUser.full_name },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
});

test.afterAll(async () => {
  await pool.end();
});

test.describe('Upload Hardening: Document Vault (POST /api/student/documents)', () => {
  test('Rejects document upload with disallowed extension (.exe, .sh, .php) with 400', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/student/documents`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      multipart: {
        title: 'Malicious Executable',
        category: 'Assignments',
        file: {
          name: 'payload.exe',
          mimeType: 'application/octet-stream',
          buffer: Buffer.from('MZ executable header test'),
        },
      },
    });

    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/unsupported|invalid file type|extension/i);
  });

  test('Rejects document upload with spoofed MIME type failing magic-byte check with 400', async ({ request }) => {
    // Declares application/pdf but body is plain text / not %PDF-
    const res = await request.post(`${BASE_URL}/api/student/documents`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      multipart: {
        title: 'Spoofed PDF Document',
        category: 'Certificates',
        file: {
          name: 'fake_cert.pdf',
          mimeType: 'application/pdf',
          buffer: Buffer.from('This is not a real PDF file! No magic bytes here.'),
        },
      },
    });

    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/magic bytes|not a valid pdf|corrupted/i);
  });

  test('Accepts valid document with matching magic bytes and enforces server-generated filename and ownership', async ({ request }) => {
    const validPdfBytes = Buffer.from('%PDF-1.4 valid student document content');
    const res = await request.post(`${BASE_URL}/api/student/documents`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      multipart: {
        title: 'Legitimate Semester Report',
        category: 'Assignments',
        file: {
          name: 'my_report.pdf',
          mimeType: 'application/pdf',
          buffer: validPdfBytes,
        },
      },
    });

    expect(res.status()).toBe(201);
    const json = await res.json();
    expect(json.document).toBeDefined();
    const docId = json.document.id;
    const fileUrl = json.document.file_url;

    // Verify filename on disk is randomized and not the raw original name
    expect(fileUrl).not.toContain('my_report.pdf');
    expect(fileUrl).toMatch(/\/uploads\/student-docs\/\d+-[a-f0-9]+\.pdf$/i);

    // 1. Owner student can download
    const ownDownloadRes = await request.get(`${BASE_URL}/api/student/documents/${docId}/file`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(ownDownloadRes.status()).toBe(200);

    // 2. Different student receives 404 / 403 (IDOR protected)
    const otherDownloadRes = await request.get(`${BASE_URL}/api/student/documents/${docId}/file`, {
      headers: { Authorization: `Bearer ${otherStudentToken}` },
    });
    expect([403, 404]).toContain(otherDownloadRes.status());

    // Clean up
    await request.delete(`${BASE_URL}/api/student/documents/${docId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
  });
});

test.describe('Upload Hardening: Post Attachments (POST /api/student/posts)', () => {
  test('Rejects post creation when attachment fails magic-byte check with 400', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/student/posts`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      multipart: {
        title: 'Post with Fake Image Attachment',
        description: 'Post description for testing attachments',
        category: 'General',
        files: {
          name: 'fake_image.png',
          mimeType: 'image/png',
          buffer: Buffer.from('NOT A PNG FILE'),
        },
      },
    });

    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/magic bytes|not a valid|corrupted/i);
  });
});

test.describe('Upload Hardening: Profile Photo (POST /api/student/upload-photo)', () => {
  test('Rejects profile photo upload with invalid/spoofed magic bytes with 400', async ({ request }) => {
    // Send HTML/script pretending to be image
    const spoofedDataUrl = 'data:image/png;base64,' + Buffer.from('<script>alert("XSS")</script>').toString('base64');
    const res = await request.post(`${BASE_URL}/api/student/upload-photo`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: { photo_data_url: spoofedDataUrl },
    });

    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid.*image|magic bytes|unsupported/i);
  });

  test('Accepts valid PNG profile photo with real magic bytes', async ({ request }) => {
    // Valid 1x1 transparent PNG buffer
    const validPngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64'
    );
    const validDataUrl = `data:image/png;base64,${validPngBuffer.toString('base64')}`;

    const res = await request.post(`${BASE_URL}/api/student/upload-photo`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: { photo_data_url: validDataUrl },
    });

    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.message).toMatch(/updated successfully/i);
  });
});
