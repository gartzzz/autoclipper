/**
 * Analysis Routes
 * Endpoints for viral moment detection
 */

import { Router, Request, Response } from 'express';
import { checkOllamaHealth, DEFAULT_MODEL } from '../services/ollama.js';
import { analyzeTranscript } from '../services/analyzer.js';
import { logger } from '../utils/logger.js';
import type { AnalyzeRequest, HealthResponse, StreamEvent } from '../types/index.js';

const router = Router();

// Track ongoing analysis for cancellation
let currentAnalysis: AbortController | null = null;

/**
 * Health check endpoint
 * GET /api/analyze/health
 */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const health = await checkOllamaHealth();

    const response: HealthResponse = {
      status: health.connected ? 'ok' : 'error',
      message: health.error || 'AutoClipper server running',
      ollamaConnected: health.connected,
      model: health.model || undefined
    };

    res.json(response);
  } catch (error) {
    logger.error({ error }, 'Health check failed');
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
      ollamaConnected: false
    });
  }
});

/**
 * Analyze transcript for viral moments
 * POST /api/analyze
 *
 * Supports both regular JSON response and SSE streaming
 */
router.post('/', async (req: Request, res: Response) => {
  const body = req.body as AnalyzeRequest;

  // Validate request
  if (!body.segments || !Array.isArray(body.segments) || body.segments.length === 0) {
    return res.status(400).json({
      error: 'Invalid request: segments array is required'
    });
  }

  // Check if client wants streaming
  const wantsStream = req.headers.accept?.includes('text/event-stream');

  logger.info(
    {
      segmentCount: body.segments.length,
      options: body.options,
      streaming: wantsStream
    },
    'Analysis request received'
  );

  // Set up abort controller for cancellation
  currentAnalysis = new AbortController();
  const signal = currentAnalysis.signal;

  try {
    if (wantsStream) {
      // SSE streaming response
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const sendEvent = (event: StreamEvent) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      // Check for cancellation
      if (signal.aborted) {
        sendEvent({ type: 'error', error: 'Analysis cancelled' });
        return res.end();
      }

      const clips = await analyzeTranscript(
        body.segments,
        body.options || {},
        (progress, message, momentsFound) => {
          if (!signal.aborted) {
            sendEvent({
              type: 'progress',
              progress,
              message,
              momentsFound
            });
          }
        }
      );

      if (signal.aborted) {
        sendEvent({ type: 'error', error: 'Analysis cancelled' });
      } else {
        sendEvent({ type: 'complete', clips });
      }

      res.end();

    } else {
      // Regular JSON response
      const startTime = Date.now();

      const clips = await analyzeTranscript(
        body.segments,
        body.options || {}
      );

      if (signal.aborted) {
        return res.status(499).json({ error: 'Analysis cancelled' });
      }

      res.json({
        clips,
        processingTime: Date.now() - startTime,
        model: DEFAULT_MODEL
      });
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: message }, 'Analysis failed');

    if (req.headers.accept?.includes('text/event-stream')) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: message })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: message });
    }
  } finally {
    currentAnalysis = null;
  }
});

/**
 * Cancel ongoing analysis
 * POST /api/analyze/cancel
 */
router.post('/cancel', (_req: Request, res: Response) => {
  if (currentAnalysis) {
    currentAnalysis.abort();
    logger.info('Analysis cancelled by user');
    res.json({ cancelled: true });
  } else {
    res.json({ cancelled: false, message: 'No analysis in progress' });
  }
});

export default router;
