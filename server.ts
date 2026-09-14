import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import authRoutes from './server/routes/auth-routes.js';
import adminRoutes from './server/routes/admin-routes.js';
import teacherRoutes from './server/routes/teacher-routes.js';
import studentRoutes from './server/routes/student-routes.js';
import { initializeDatabase } from './server/db.js';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  await initializeDatabase();

  // JSON Body parsing with ample headroom for file/resume uploads
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

  // Upload paths are served only by authenticated route handlers.
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🏛️ Vission Academy Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
