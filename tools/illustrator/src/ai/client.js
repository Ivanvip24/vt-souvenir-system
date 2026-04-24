/**
 * Anthropic API client singleton with timeout and graceful degradation.
 * All AI calls in the system go through this module.
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

let client = null;
let apiKeyAvailable = false;

export const MODEL = 'claude-haiku-4-5-20251001';
export const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Load API key from environment or .env file.
 */
function loadApiKey() {
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }

  const envPath = path.join(PROJECT_ROOT, '.env');
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf8');
    const match = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    if (match) {
      const key = match[1].trim().replace(/^["']|["']$/g, '');
      process.env.ANTHROPIC_API_KEY = key;
      return key;
    }
  }

  return null;
}

/**
 * Initialize the Anthropic client. Call once at app startup.
 */
export function initAI() {
  const apiKey = loadApiKey();
  if (!apiKey) {
    console.log('[AI] No ANTHROPIC_API_KEY found. AI features disabled, using algorithmic fallbacks.');
    apiKeyAvailable = false;
    return false;
  }

  try {
    client = new Anthropic({ apiKey });
    apiKeyAvailable = true;
    console.log('[AI] Anthropic client initialized. AI features enabled.');
    return true;
  } catch (err) {
    console.log(`[AI] Failed to initialize: ${err.message}`);
    apiKeyAvailable = false;
    return false;
  }
}

export function isAIAvailable() {
  return apiKeyAvailable && client !== null;
}

/**
 * Send a message to Claude with timeout and error handling.
 * Returns the text response or null on failure.
 */
export async function askClaude(systemPrompt, userMessage, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!isAIAvailable()) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      },
      { signal: controller.signal }
    );

    clearTimeout(timeoutId);
    return response.content?.[0]?.text || null;
  } catch (err) {
    if (err.name === 'AbortError' || err.message?.includes('abort')) {
      console.log(`[AI] Timed out after ${timeoutMs}ms. Using fallback.`);
    } else {
      console.log(`[AI] API error: ${err.message}. Using fallback.`);
    }
    return null;
  }
}

/**
 * Send a message and parse the response as JSON.
 */
export async function askClaudeJSON(systemPrompt, userMessage, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const text = await askClaude(systemPrompt, userMessage, timeoutMs);
  if (!text) return null;

  try {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
    return JSON.parse(jsonMatch[1].trim());
  } catch (err) {
    console.log(`[AI] JSON parse failed: ${err.message}`);
    console.log(`[AI] Raw: ${text.substring(0, 200)}`);
    return null;
  }
}
