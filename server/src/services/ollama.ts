/**
 * Ollama Service
 * Handles communication with the local Ollama instance
 */

import { Ollama } from 'ollama';
import { logger } from '../utils/logger.js';

// Default model - can be configured via environment
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b-instruct';

// Ollama client
const ollama = new Ollama({
  host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434'
});

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Check if Ollama is running and the model is available
 */
export async function checkOllamaHealth(): Promise<{
  connected: boolean;
  model: string | null;
  error?: string;
}> {
  try {
    // Try to list models
    const models = await ollama.list();

    // Check if our preferred model is available
    const modelNames = models.models.map(m => m.name);
    const hasModel = modelNames.some(name =>
      name.startsWith(DEFAULT_MODEL.split(':')[0])
    );

    if (!hasModel) {
      return {
        connected: true,
        model: null,
        error: `Model ${DEFAULT_MODEL} not found. Available: ${modelNames.join(', ')}`
      };
    }

    return {
      connected: true,
      model: DEFAULT_MODEL
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: message }, 'Ollama health check failed');

    return {
      connected: false,
      model: null,
      error: message.includes('ECONNREFUSED')
        ? 'Ollama is not running. Start it with: ollama serve'
        : message
    };
  }
}

/**
 * Send a chat message to Ollama and get a response
 */
export async function chat(
  systemPrompt: string,
  userPrompt: string,
  options: ChatOptions = {}
): Promise<string> {
  const model = options.model || DEFAULT_MODEL;

  logger.info({ model, promptLength: userPrompt.length }, 'Sending chat request to Ollama');

  try {
    const response = await ollama.chat({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 4096
      }
    });

    logger.info(
      {
        model,
        totalDuration: response.total_duration,
        evalCount: response.eval_count
      },
      'Ollama response received'
    );

    return response.message.content;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: message, model }, 'Ollama chat failed');
    throw new Error(`Ollama error: ${message}`);
  }
}

/**
 * Stream a chat response from Ollama
 */
export async function* chatStream(
  systemPrompt: string,
  userPrompt: string,
  options: ChatOptions = {}
): AsyncGenerator<string, void, unknown> {
  const model = options.model || DEFAULT_MODEL;

  logger.info({ model, promptLength: userPrompt.length }, 'Starting streaming chat');

  try {
    const stream = await ollama.chat({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      stream: true,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 4096
      }
    });

    for await (const chunk of stream) {
      yield chunk.message.content;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: message, model }, 'Ollama stream failed');
    throw new Error(`Ollama stream error: ${message}`);
  }
}

/**
 * Pull a model if not available
 */
export async function pullModel(modelName: string = DEFAULT_MODEL): Promise<void> {
  logger.info({ model: modelName }, 'Pulling model from Ollama');

  try {
    const stream = await ollama.pull({ model: modelName, stream: true });

    for await (const progress of stream) {
      if (progress.total && progress.completed) {
        const percent = Math.round((progress.completed / progress.total) * 100);
        logger.info({ model: modelName, percent }, 'Download progress');
      }
    }

    logger.info({ model: modelName }, 'Model pulled successfully');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: message, model: modelName }, 'Failed to pull model');
    throw error;
  }
}

export { DEFAULT_MODEL };
