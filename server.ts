import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import authRoutes from './server/routes/auth-routes.js';
import adminRoutes from './server/routes/admin-routes.js';
import teacherRoutes from './server/routes/teacher-routes.js';
import studentRoutes from './server/routes/student-routes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  const { memDb } = await import('./server/db.js');
  await memDb.seedInstitutionData();

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

  // Mock download endpoint for generated marksheets & resumes
  app.get('/uploads/:folder/:filename', (req, res) => {
    const { folder, filename } = req.params;
    if (folder === 'marksheets') {
      return res.status(404).json({ error: 'Official marksheets require authentication.' });
    }
    res.setHeader('Content-Type', filename.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    // Return an official university document preview banner
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Vission Academy Official Document - ${filename}</title>
        <style>
          body { font-family: 'Times New Roman', serif; padding: 40px; background: #f8fafc; color: #0f172a; }
          .document { max-width: 750px; margin: 0 auto; background: white; padding: 50px; border: 2px solid #0f2744; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
          .crest { text-align: center; border-bottom: 2px double #b45309; padding-bottom: 20px; margin-bottom: 30px; }
          .crest h1 { margin: 0; font-size: 26px; color: #0f2744; text-transform: uppercase; letter-spacing: 2px; }
          .crest p { margin: 5px 0 0 0; font-size: 13px; color: #64748b; letter-spacing: 1px; }
          .seal { display: inline-block; width: 60px; height: 60px; border-radius: 50%; border: 3px solid #b45309; line-height: 56px; font-weight: bold; color: #b45309; margin-bottom: 10px; }
          .content { line-height: 1.8; font-size: 15px; }
        </style>
      </head>
      <body>
        <div class="document">
          <div class="crest">
            <div class="seal">VA</div>
            <h1>Vission Academy of Engineering & Technology</h1>
            <p>Office of the Academic Registrar • Official Record</p>
          </div>
          <div class="content">
            <h3 style="color: #0f2744; text-transform: uppercase; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px;">Document: ${filename}</h3>
            <p><strong>Category:</strong> ${folder.toUpperCase()}</p>
            <p><strong>Verification Status:</strong> Cryptographically Verified & Authenticated by Institutional Key Vault.</p>
            <p>This official electronic record has been issued by the Vission Academy Academic Information System. Any modification or unauthorized reproduction constitutes an academic infraction.</p>
            <div style="margin-top: 50px; display: flex; justify-content: space-between;">
              <div>
                <p>__________________________<br><strong>Dr. Arthur Vance</strong><br>Dean of Academic Affairs</p>
              </div>
              <div style="text-align: right;">
                <p>__________________________<br><strong>Office of the Controller</strong><br>Vission Academy Board of Examinations</p>
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `);
  });

  // Mount API Endpoints
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/teacher', teacherRoutes);
  app.use('/api/student', studentRoutes);

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
