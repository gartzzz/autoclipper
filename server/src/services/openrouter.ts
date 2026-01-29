/**
 * OpenRouter Service
 * Handles communication with OpenRouter API for LLM inference
 * Using Kimi K2 (moonshotai/kimi-k2:free) as default model
 */

import { logger } from '../utils/logger.js';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'moonshotai/kimi-k2:free';

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Get API key from environment
 */
function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error('OPENROUTER_API_KEY environment variable is required');
  }
  return key;
}

/**
 * Check if OpenRouter is configured and working
 */
export async function checkOpenRouterHealth(): Promise<{
  connected: boolean;
  model: string | null;
  error?: string;
}> {
  try {
    const apiKey = getApiKey();

    // Test with a simple request
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/gartzzz/autoclipper',
        'X-Title': 'AutoClipper'
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return {
        connected: false,
        model: null,
        error: error.error?.message || `HTTP ${response.status}`
      };
    }

    return {
      connected: true,
      model: DEFAULT_MODEL
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      connected: false,
      model: null,
      error: message
    };
  }
}

/**
 * Send a chat message to OpenRouter and get a response
 */
export async function chat(
  systemPrompt: string,
  userPrompt: string,
  options: ChatOptions = {}
): Promise<string> {
  const model = options.model || DEFAULT_MODEL;
  const apiKey = getApiKey();

  logger.info(
    { model, promptLength: userPrompt.length },
    'Sending chat request to OpenRouter'
  );

  const startTime = Date.now();

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/gartzzz/autoclipper',
        'X-Title': 'AutoClipper'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 4096
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in response');
    }

    logger.info(
      {
        model,
        duration: Date.now() - startTime,
        tokensUsed: data.usage?.total_tokens
      },
      'OpenRouter response received'
    );

    return content;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: message, model }, 'OpenRouter chat failed');
    throw new Error(`OpenRouter error: ${message}`);
  }
}

/**
 * Stream a chat response from OpenRouter
 */
export async function* chatStream(
  systemPrompt: string,
  userPrompt: string,
  options: ChatOptions = {}
): AsyncGenerator<string, void, unknown> {
  const model = options.model || DEFAULT_MODEL;
  const apiKey = getApiKey();

  logger.info({ model, promptLength: userPrompt.length }, 'Starting streaming chat');

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/gartzzz/autoclipper',
        'X-Title': 'AutoClipper'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 4096,
        stream: true
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const data = JSON.parse(line.slice(6));
            const content = data.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: message, model }, 'OpenRouter stream failed');
    throw new Error(`OpenRouter stream error: ${message}`);
  }
}

export { DEFAULT_MODEL };
