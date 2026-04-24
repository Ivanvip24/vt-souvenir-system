/**
 * AI-powered command parser (Layer 1).
 * Uses Claude to understand natural language commands in Spanish/English.
 * Falls back to keyword parser if AI is unavailable.
 */

import { askClaudeJSON, isAIAvailable } from './client.js';
import { parseCommand as keywordParse } from '../cli/parser.js';

const SYSTEM_PROMPT = `You are a command parser for ARMADO AI, a print production system.
Extract structured data from natural language commands in Spanish or English.

Products:
- IMANES (magnets) — sizes: Mini, Mediano, Grande
- LLAVEROS (keychains) — no size categories
- DESTAPADOR (bottle openers) — no size categories
- LIBRETA (notebooks) — max 16 pieces
- PORTALLAVES (key holders) — always 4 pieces

Aliases:
- iman/imanes/imán/magnets → IMANES
- llavero/llaveros/keychain → LLAVEROS
- destapador/opener/abridores → DESTAPADOR
- libreta/notebook/libretas → LIBRETA
- portallaves/keyholder → PORTALLAVES
- mini/chico/pequeño → Mini
- mediano/normal/normales/medio/regular → Mediano
- grande/grandes/mega/big/large → Grande

Rules:
- If count specified, extract as number. Otherwise null.
- For IMANES without size, default sizeCategory to "Mediano".
- PORTALLAVES count is always 4.
- "hazme" = make me, "quiero" = I want, "de este" = of this
- If dimensions like "5cm x 3cm" or "5x3" mentioned, extract them.

Respond ONLY with JSON, no explanation:
{"product":"IMANES"|"LLAVEROS"|"DESTAPADOR"|"LIBRETA"|"PORTALLAVES"|null,"count":number|null,"sizeCategory":"Mini"|"Mediano"|"Grande"|null,"dimensions":{"w":number,"h":number}|null}`;

const VALID_PRODUCTS = ['IMANES', 'LLAVEROS', 'DESTAPADOR', 'LIBRETA', 'PORTALLAVES'];

/**
 * Parse a user command using AI, with keyword parser fallback.
 */
export async function aiParseCommand(command) {
  if (isAIAvailable()) {
    console.log('[AI-PARSER] Sending to Claude...');
    const result = await askClaudeJSON(SYSTEM_PROMPT, command);

    if (result && result.product && VALID_PRODUCTS.includes(result.product)) {
      console.log(`[AI-PARSER] AI parsed: ${JSON.stringify(result)}`);
      return {
        product: result.product,
        count: typeof result.count === 'number' ? result.count : null,
        sizeCategory: result.sizeCategory || null,
        dimensions: result.dimensions || null,
      };
    }

    console.log('[AI-PARSER] AI returned unusable result. Falling back.');
  }

  console.log('[AI-PARSER] Using keyword parser.');
  return keywordParse(command);
}
