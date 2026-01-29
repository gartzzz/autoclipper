/**
 * AutoClipper Server - Entry Point
 */

import app from './server.js';
import { logger } from './utils/logger.js';
import { checkOllamaHealth } from './services/ollama.js';

const PORT = process.env.PORT || 3847;

async function main() {
  // Check Ollama connection on startup
  logger.info('Checking Ollama connection...');
  const health = await checkOllamaHealth();

  if (!health.connected) {
    logger.warn({ error: health.error }, 'Ollama not available');
    logger.warn('Make sure Ollama is running: ollama serve');
  } else {
    logger.info({ model: health.model }, 'Ollama connected');
  }

  // Start server
  app.listen(PORT, () => {
    logger.info(`AutoClipper server running on http://127.0.0.1:${PORT}`);
    logger.info('Endpoints:');
    logger.info(`  Health: GET http://127.0.0.1:${PORT}/api/analyze/health`);
    logger.info(`  Analyze: POST http://127.0.0.1:${PORT}/api/analyze`);
  });
}

main().catch((error) => {
  logger.error({ error }, 'Failed to start server');
  process.exit(1);
});
