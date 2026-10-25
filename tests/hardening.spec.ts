import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const BASE_URL = 'http://127.0.0.1:3000';

test.describe('Phase 3: Server Hardening Suite', () => {
  test('Responses contain Helmet security headers and strict Content-Security-Policy', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/health`);
    expect(res.status()).toBe(200);

    const headers = res.headers();

    // 1. Check for nosniff header
    expect(headers['x-content-type-options']).toBe('nosniff');

    // 2. Check for X-Frame-Options or frame-ancestors
    expect(headers['x-frame-options']).toMatch(/DENY|SAMEORIGIN/i);

    // 3. Check for Content-Security-Policy
    const csp = headers['content-security-policy'] || headers['content-security-policy-report-only'];
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
  });

  test('CORS blocks unauthorized cross-origin requests by default when no origin is allowlisted', async ({ request }) => {
    const res = await request.fetch(`${BASE_URL}/api/health`, {
      headers: {
        Origin: 'https://malicious-attacker.com',
      },
    });

    // In a strict same-origin CORS setup, an unauthorized origin does not receive Access-Control-Allow-Origin: https://malicious-attacker.com
    const acao = res.headers()['access-control-allow-origin'];
    expect(acao).not.toBe('https://malicious-attacker.com');
  });

  test('Central error handler suppresses internal stack traces and database errors in responses', async ({ request }) => {
    // Calling an endpoint with intentionally invalid parameter to trigger an error
    const res = await request.get(`${BASE_URL}/api/teacher/classes/invalid_id/students`, {
      headers: { Authorization: 'Bearer invalid_or_bad_token' },
    });

    // Must return structured clean JSON, never raw HTML stack trace
    expect(res.status()).toBe(401);
    const json = await res.json();
    expect(json.error).toBeDefined();
    expect(json.stack).toBeUndefined();
    expect(JSON.stringify(json)).not.toMatch(/SELECT|INSERT|UPDATE|WHERE|node_modules/i);
  });

  test('Rate limiting ignores x-bypass-ratelimit header when in production', async () => {
    const { rateLimit } = await import('../server/auth.js');
    const oldNodeEnv = process.env.NODE_ENV;
    const oldFlag = process.env.ALLOW_TEST_RATE_LIMIT_BYPASS;
    try {
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_TEST_RATE_LIMIT_BYPASS = 'true';
      const limiter = rateLimit(1, 60000, 'prod-test-bypass');
      let statusCalled = 0;
      let jsonCalled: any = null;
      let nextCalled = 0;
      const req: any = {
        headers: { 'x-bypass-ratelimit': 'qa-stress-suite' },
        ip: '127.0.0.10',
        socket: { remoteAddress: '127.0.0.10' },
      };
      const res: any = {
        status: (s: number) => { statusCalled = s; return res; },
        json: (j: any) => { jsonCalled = j; return res; },
      };
      limiter(req, res, () => { nextCalled++; });
      expect(nextCalled).toBe(1);

      limiter(req, res, () => { nextCalled++; });
      expect(statusCalled).toBe(429);
      expect(jsonCalled).toEqual({ error: 'Too many requests. Please try again later.' });
    } finally {
      process.env.NODE_ENV = oldNodeEnv;
      process.env.ALLOW_TEST_RATE_LIMIT_BYPASS = oldFlag;
    }
  });

  test('Rate limiting requires explicit ALLOW_TEST_RATE_LIMIT_BYPASS=true to honor x-bypass-ratelimit', async () => {
    const { rateLimit } = await import('../server/auth.js');
    const oldNodeEnv = process.env.NODE_ENV;
    const oldFlag = process.env.ALLOW_TEST_RATE_LIMIT_BYPASS;
    try {
      process.env.NODE_ENV = 'development';
      delete process.env.ALLOW_TEST_RATE_LIMIT_BYPASS;
      const limiter = rateLimit(1, 60000, 'dev-test-bypass-noflag');
      let statusCalled = 0;
      let nextCalled = 0;
      const req: any = {
        headers: { 'x-bypass-ratelimit': 'qa-stress-suite' },
        ip: '127.0.0.11',
        socket: { remoteAddress: '127.0.0.11' },
      };
      const res: any = {
        status: (s: number) => { statusCalled = s; return res; },
        json: () => res,
      };
      limiter(req, res, () => { nextCalled++; });
      expect(nextCalled).toBe(1);

      limiter(req, res, () => { nextCalled++; });
      expect(statusCalled).toBe(429);
    } finally {
      process.env.NODE_ENV = oldNodeEnv;
      process.env.ALLOW_TEST_RATE_LIMIT_BYPASS = oldFlag;
    }
  });

  test('Unknown /api/* paths must return JSON 404 before SPA fallback', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/nonexistent-route-404-test`);
    expect(res.status()).toBe(404);
    const contentType = res.headers()['content-type'] || '';
    expect(contentType).toContain('application/json');
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  test('Frontend API client throws an error when server returns non-JSON', async () => {
    const { api } = await import('../src/lib/api.js');
    await expect(api.get('/login')).rejects.toThrow(/Expected JSON response/);
  });

  test('Frontend API client supports 204 No Content without throwing', async () => {
    const { api } = await import('../src/lib/api.js');
    const origFetch = global.fetch;
    try {
      global.fetch = async () => new Response(null, { status: 204, statusText: 'No Content' });
      const result = await api.request('/api/test-204');
      expect(result).toBeUndefined();
    } finally {
      global.fetch = origFetch;
    }
  });

  test('Frontend API client supports blob/file download without throwing on non-JSON', async () => {
    const { api } = await import('../src/lib/api.js');
    const origFetch = global.fetch;
    try {
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
      global.fetch = async () => new Response(pdfBytes, {
        status: 200,
        headers: { 'Content-Type': 'application/pdf', 'Content-Length': '5' }
      });
      const blob = await api.request<Blob>('/api/student/marksheets/mks_test/file');
      expect(blob).toBeDefined();
      expect(typeof blob.size === 'number' || typeof blob.arrayBuffer === 'function').toBe(true);
    } finally {
      global.fetch = origFetch;
    }
  });

  test('Database SSL config parser enforces rejectUnauthorized: true by default in production and supports DB_SSL_INSECURE', async () => {
    const { parseDbSslConfig } = await import('../server/db.js');
    
    // 1. No SSL requested -> undefined
    expect(parseDbSslConfig({ DATABASE_URL: 'postgres://localhost/test' })).toBeUndefined();

    // 2. SSL requested via DB_SSL=true -> rejectUnauthorized: true
    expect(parseDbSslConfig({ DATABASE_URL: 'postgres://localhost/test', DB_SSL: 'true' })).toEqual({
      rejectUnauthorized: true,
    });

    // 3. SSL requested via sslmode=verify-full in URL -> rejectUnauthorized: true
    expect(parseDbSslConfig({ DATABASE_URL: 'postgres://localhost/test?sslmode=verify-full' })).toEqual({
      rejectUnauthorized: true,
    });

    // 4. Custom CA certificate provided -> included in config
    expect(parseDbSslConfig({ DATABASE_URL: 'postgres://localhost/test?sslmode=require', DB_SSL_CA: 'MOCK_CA_CERT' })).toEqual({
      rejectUnauthorized: true,
      ca: 'MOCK_CA_CERT'
    });

    // 5. Insecure flag DB_SSL_INSECURE=true explicitly allows rejectUnauthorized: false
    expect(parseDbSslConfig({ DATABASE_URL: 'postgres://localhost/test?sslmode=require', DB_SSL_INSECURE: 'true' })).toEqual({
      rejectUnauthorized: false,
    });

    // 6. In production mode without DB_SSL_INSECURE, rejectUnauthorized is strictly true
    expect(parseDbSslConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://localhost/test?sslmode=require' })).toEqual({
      rejectUnauthorized: true,
    });
  });
});


