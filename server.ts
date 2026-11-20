import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { connectDatabase, getStorageMode } from './server/config/database.ts';
import authRoutes from './server/routes/authRoutes.ts';
import userRoutes from './server/routes/userRoutes.ts';
import calibrationRoutes from './server/routes/calibrationRoutes.ts';
import trainingRoutes from './server/routes/trainingRoutes.ts';
import analyticsRoutes from './server/routes/analyticsRoutes.ts';
import { errorHandler } from './server/middleware/errorHandler.ts';

async function startServer() {
  await connectDatabase();

  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'AmblyoCare API',
      storage: getStorageMode(),
      timestamp: new Date().toISOString(),
    });
  });

  // REST API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/calibration', calibrationRoutes);
  app.use('/api/training', trainingRoutes);
  app.use('/api/analytics', analyticsRoutes);

  // Unknown API route handler
  app.use('/api', (_req, res) => {
    res.status(404).json({ message: 'API endpoint not found.' });
  });

  // Centralized error handling middleware
  app.use(errorHandler);

  // Vite integration for dev, static dist for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[AmblyoCare] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[AmblyoCare] Failed to start server:', err);
  process.exit(1);
});
