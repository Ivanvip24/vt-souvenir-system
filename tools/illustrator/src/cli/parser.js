/**
 * Natural language command parser.
 * Converts "llavero 35" or "imanes mega 12" into structured commands.
 */

const PRODUCT_ALIASES = {
  iman: 'IMANES', imanes: 'IMANES', imán: 'IMANES', imánes: 'IMANES',
  magnets: 'IMANES', magnet: 'IMANES',
  llavero: 'LLAVEROS', llaveros: 'LLAVEROS', keychain: 'LLAVEROS', keychains: 'LLAVEROS',
  destapador: 'DESTAPADOR', destapadores: 'DESTAPADOR', opener: 'DESTAPADOR',
  libreta: 'LIBRETA', libretas: 'LIBRETA', notebook: 'LIBRETA',
  portallaves: 'PORTALLAVES', 'porta-llaves': 'PORTALLAVES', keyholder: 'PORTALLAVES',
};

const SIZE_ALIASES = {
  mini: 'Mini', chico: 'Mini', chicos: 'Mini', small: 'Mini', pequeño: 'Mini',
  mediano: 'Mediano', medianos: 'Mediano', normal: 'Mediano', normales: 'Mediano', regular: 'Mediano', medio: 'Mediano',
  grande: 'Grande', grandes: 'Grande', mega: 'Grande', big: 'Grande', large: 'Grande',
};

// Words to ignore when parsing
const NOISE_WORDS = new Set([
  'this', 'in', 'into', 'for', 'the', 'a', 'an', 'of', 'with',
  'este', 'esto', 'en', 'para', 'el', 'la', 'los', 'las', 'un', 'una',
  'de', 'con', 'como', 'piezas', 'pieces', 'hacer', 'make', 'create',
  'armado', 'armar', 'arrange', 'design', 'diseño',
  'need', 'want', 'quiero', 'necesito', 'hay', 'que',
  'please', 'por', 'favor',
]);

/**
 * Parse a natural language command into a structured object.
 * @param {string} command - e.g. "llavero 35", "imanes mega 12", "this in libreta"
 * @returns {{ product: string|null, count: number|null, sizeCategory: string|null, dimensions: {w:number,h:number}|null }}
 */
export function parseCommand(command) {
  const raw = command.trim().toLowerCase();
  const tokens = raw.split(/[\s,]+/).filter(t => t.length > 0);

  let product = null;
  let count = null;
  let sizeCategory = null;
  let dimensions = null;

  // Check for dimension pattern: "5cm x 3cm" or "5x3" or "5 x 3"
  const dimMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:cm)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:cm)?/);
  if (dimMatch) {
    dimensions = { w: parseFloat(dimMatch[1]), h: parseFloat(dimMatch[2]) };
  }

  for (const token of tokens) {
    if (NOISE_WORDS.has(token)) continue;

    // Check product
    if (!product && PRODUCT_ALIASES[token]) {
      product = PRODUCT_ALIASES[token];
      continue;
    }

    // Check size category
    if (!sizeCategory && SIZE_ALIASES[token]) {
      sizeCategory = SIZE_ALIASES[token];
      continue;
    }

    // Check for number (piece count)
    const num = parseInt(token, 10);
    if (!isNaN(num) && num > 0 && num < 1000) {
      // Don't capture dimension numbers as count
      if (!dimMatch || (!token.includes(dimMatch[1]) && !token.includes(dimMatch[2]))) {
        count = num;
      }
    }
  }

  return { product, count, sizeCategory, dimensions };
}

/**
 * Validate a parsed command and return errors if invalid.
 */
export function validateCommand(parsed) {
  if (!parsed.product) {
    return {
      valid: false,
      error: 'No se detectó tipo de producto. Por ahora solo disponible: imanes (mini, normales, mega)',
    };
  }

  if (parsed.product !== 'IMANES') {
    return {
      valid: false,
      error: `Solo imanes disponibles por ahora. Los demás productos (llaveros, destapador, libreta, portallaves) están en desarrollo.`,
    };
  }

  if (!parsed.sizeCategory) {
    parsed.sizeCategory = 'Mediano'; // Default
  }

  return { valid: true };
}
