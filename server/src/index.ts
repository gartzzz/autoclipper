/**
 * AutoClipper Server - Entry Point
 */

import app from './server.js';
import { logger } from './utils/logger.js';
import { checkOllamaHealth } from './services/ollama.js';
import { checkOpenRouterHealth } from './services/openrouter.js';

const PORT = process.env.PORT || 3847;
const useOllama = process.env.USE_OLLAMA === 'true';

async function main() {
  if (useOllama) {
    // Check Ollama connection
    logger.info('Using Ollama backend...');
    const health = await checkOllamaHealth();

    if (!health.connected) {
      logger.warn({ error: health.error }, 'Ollama not available');
      logger.warn('Make sure Ollama is running: ollama serve');
    } else {
      logger.info({ model: health.model }, 'Ollama connected');
    }
  } else {
    // Check OpenRouter connection
    logger.info('Using OpenRouter backend (Kimi K2)...');

    if (!process.env.OPENROUTER_API_KEY) {
      logger.warn('OPENROUTER_API_KEY not set');
      logger.info('Get your free API key at: https://openrouter.ai/keys');
    } else {
      const health = await checkOpenRouterHealth();

      if (!health.connected) {
        logger.warn({ error: health.error }, 'OpenRouter not available');
      } else {
        logger.info({ model: health.model }, 'OpenRouter connected');
      }
    }
  }

  // Start server
  app.listen(PORT, () => {
    logger.info(`AutoClipper server running on http://127.0.0.1:${PORT}`);
    logger.info(`Backend: ${useOllama ? 'Ollama (local)' : 'OpenRouter (Kimi K2 free)'}`);
    logger.info('Endpoints:');
    logger.info(`  Health: GET http://127.0.0.1:${PORT}/api/analyze/health`);
    logger.info(`  Analyze: POST http://127.0.0.1:${PORT}/api/analyze`);
  });
}

main().catch((error) => {
  logger.error({ error }, 'Failed to start server');
  process.exit(1);
});
