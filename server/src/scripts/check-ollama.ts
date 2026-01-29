/**
 * Script to check Ollama availability and download model if needed
 */

import { checkOllamaHealth, pullModel, DEFAULT_MODEL } from '../services/ollama.js';
import { logger } from '../utils/logger.js';

async function main() {
  logger.info('Checking Ollama setup...\n');

  const health = await checkOllamaHealth();

  if (!health.connected) {
    logger.error('Ollama is not running!');
    logger.info('\nTo fix this:');
    logger.info('1. Install Ollama: https://ollama.ai/download');
    logger.info('2. Start Ollama: ollama serve');
    logger.info(`3. Pull model: ollama pull ${DEFAULT_MODEL}`);
    process.exit(1);
  }

  logger.info('Ollama is running');

  if (!health.model) {
    logger.warn(`Model ${DEFAULT_MODEL} not found`);
    logger.info('\nDownloading model...');

    try {
      await pullModel(DEFAULT_MODEL);
      logger.info('Model downloaded successfully!');
    } catch (error) {
      logger.error('Failed to download model');
      logger.info(`\nTry manually: ollama pull ${DEFAULT_MODEL}`);
      process.exit(1);
    }
  } else {
    logger.info(`Model ready: ${health.model}`);
  }

  logger.info('\n✓ Ollama is ready for AutoClipper!');
}

main().catch(console.error);
