/**
 * Express Server Configuration
 */

import express from 'express';
import cors from 'cors';
import analyzeRoutes from './routes/analyze.js';
import { logger } from './utils/logger.js';

const app = express();

// Middleware
app.use(cors({
  origin: '*', // Allow CEP panels from any origin
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept']
}));

app.use(express.json({ limit: '10mb' })); // Allow large transcripts

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: Date.now() - start
    });
  });
  next();
});

// Routes
app.use('/api/analyze', analyzeRoutes);

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    name: 'AutoClipper Server',
    version: '1.0.0',
    endpoints: {
      health: 'GET /api/analyze/health',
      analyze: 'POST /api/analyze',
      cancel: 'POST /api/analyze/cancel'
    }
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ error: err.message, stack: err.stack }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
