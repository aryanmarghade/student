import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './server/routes/auth-routes.js';
import adminRoutes from './server/routes/admin-routes.js';
import teacherRoutes from './server/routes/teacher-routes.js';
import studentRoutes from './server/routes/student-routes.js';
import placementRoutes from './server/routes/placement-routes.js';
import aiRoutes from './server/routes/ai-feedback-routes.js';
import { initializeDatabase } from './server/db.js';
import { startGitHubScheduler } from './server/github-sync.js';
import { startLinkedInScheduler } from './server/linkedin-sync.js';
import { startHackerRankScheduler } from './server/hackerrank-sync.js';

const isDemoMode = process.env.NODE_ENV === 'demo' || process.argv.includes('--demo');
const envFile = process.env.DOTENV_CONFIG_PATH || (process.env.NODE_ENV === 'test' ? '.env.test' : isDemoMode ? '.env.demo' : '.env');
dotenv.config({ path: path.resolve(process.cwd(), envFile), override: true });

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // 1. Configure Trust Proxy from environment (default: false / 0 hops to prevent IP spoofing)
  const trustProxyEnv = process.env.TRUST_PROXY;
  if (trustProxyEnv !== undefined && trustProxyEnv.trim() !== '') {
    const hops = Number(trustProxyEnv);
    app.set('trust proxy', isNaN(hops) ? trustProxyEnv.trim() : hops);
  } else {
    app.set('trust proxy', false);
  }

  await initializeDatabase();

  // 2. Helmet Security Headers with Vite/React compatible CSP
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            ...(process.env.NODE_ENV === 'production'
              ? []
              : ["'unsafe-inline'", "'unsafe-eval'"]),
          ],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com",
          ],
          fontSrc: [
            "'self'",
            "https://fonts.gstatic.com",
            "data:",
          ],
          imgSrc: [
            "'self'",
            "data:",
            "blob:",
            "https:",
          ],
          connectSrc: [
            "'self'",
            ...(process.env.NODE_ENV === 'production'
              ? []
              : ["ws://localhost:3000", "ws://127.0.0.1:3000", "http://localhost:3000", "http://127.0.0.1:3000", "ws://127.0.0.1:*", "ws://localhost:*"]),
          ],
          mediaSrc: ["'self'", "data:", "blob:"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );

  // 3. Explicit CORS Allowlist from Environment (Same-Origin by Default)
  const rawAllowedOrigins = process.env.ALLOWED_ORIGINS || '';
  const allowedOrigins = rawAllowedOrigins
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        try {
          const originUrl = new URL(origin);
          if (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1') {
            return callback(null, true);
          }
        } catch {}
        if (allowedOrigins.length === 0) {
          return callback(new Error('CORS blocked by default policy (same-origin only).'));
        }
        if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
          return callback(null, true);
        }
        return callback(new Error(`Origin ${origin} not permitted by CORS allowlist.`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Auth-Refresh', 'X-Bypass-Ratelimit'],
    })
  );

  // Cookie parsing for secure refresh token
  app.use(cookieParser());

  // Start background schedulers
  startGitHubScheduler().catch((err) =>
    console.error('[GitHub Sync] Scheduler startup failed:', err.message)
  );
  startLinkedInScheduler().catch((err) =>
    console.error('[LinkedIn Sync] Scheduler startup failed:', err.message)
  );
  startHackerRankScheduler().catch((err) =>
    console.error('[HackerRank Sync] Scheduler startup failed:', err.message)
  );

  // JSON Body parsing
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // API Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'Vission Academy API',
      timestamp: new Date().toISOString()
    });
  });

  // Mount API Endpoints
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/teacher', teacherRoutes);
  app.use('/api/student', studentRoutes);
  app.use('/api/placement', placementRoutes);
  app.use('/api/ai', aiRoutes);

  // Return JSON 404 for any unhandled /api/* route before SPA fallback
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found', path: req.originalUrl });
  });

  // Upload paths are served only by authenticated route handlers
  app.get('/uploads/:folder/:filename', (_req, res) => {
    res.status(404).json({ error: 'Direct file access is not available.' });
  });

  // Vite middleware in development mode
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // 4. Central Error Handler Middleware (Server-Side Logging, Clean Production Responses)
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(`[Server Error] ${req.method} ${req.originalUrl}:`, err?.message || err);

    if (res.headersSent) {
      return next(err);
    }

    const statusCode = typeof err.status === 'number' && err.status >= 400 && err.status < 600
      ? err.status
      : err.name === 'UnauthorizedError' ? 401
      : err.code === '23505' ? 409
      : err.code === '23503' ? 409
      : err.message?.includes('CORS') ? 403
      : 500;

    if (process.env.NODE_ENV === 'production') {
      const safeMessage = statusCode === 400 ? (err.message || 'Bad Request')
        : statusCode === 401 ? 'Unauthorized'
        : statusCode === 403 ? (err.message || 'Forbidden')
        : statusCode === 404 ? 'Resource not found'
        : statusCode === 409 ? 'A conflicting resource already exists or is referenced.'
        : 'An unexpected internal server error occurred.';

      return res.status(statusCode).json({ error: safeMessage });
    }

    return res.status(statusCode).json({
      error: err.message || 'Internal Server Error',
      code: err.code || err.name,
    });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🏛️ Vission Academy Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
