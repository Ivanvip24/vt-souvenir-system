// Product configurations extracted from ARMADO.jsx
// All dimensions in centimeters

export const SHEET = {
  width: 30,
  height: 39,
  margin: 0.05,
  gapX: 0.09,
  gapY: 0.19,
  templatePath: '~/Desktop/TEMPLATES/ARMADOVT.ait',
};

export const USABLE = {
  width: SHEET.width - SHEET.margin * 2,
  height: SHEET.height - SHEET.margin * 2,
};

export const SIZE_LIMITS = {
  minWidth: 2.0,
  minHeight: 2.0,
  maxWidth: 29.6,
  maxHeight: 38.6,
};

export const CUT_LINE_COLOR = { r: 227, g: 19, b: 27, tolerance: 50 };

export const PRODUCTS = {
  IMANES: {
    // Minimum piece counts per size category
    // Square/circular: must fit at least this many at max size
    // Long (alargado): must fit at least this many at max size
    defaultCounts: { Mini: 42, Mediano: 20, Grande: 12 },
    defaultCountLong: { Mini: 40, Mediano: 17, Grande: 10 },
    // Target product sizes (from Imanes MDF size guide)
    // Pieces should be approximately these dimensions
    targetSize: {
      Mini: {
        square: { w: 5.0, h: 5.0 },
        long:   { w: 3.5, h: 7.0 },
      },
      Mediano: {
        square: { w: 7.5, h: 7.5 },
        long:   { w: 5.5, h: 11.5 },
      },
      Grande: {
        square: { w: 9.5, h: 9.5 },
        long:   { w: 7.5, h: 13.5 },
      },
    },
    useOriginalSize: false,
  },

  LLAVEROS: {
    defaultCount: 35,
    useOriginalSize: true,
  },

  DESTAPADOR: {
    defaultCount: null, // use max at original size
    useOriginalSize: true,
  },

  LIBRETA: {
    pieceWidth: 21.5,
    pieceHeight: 14.0,
    sheetWidth: 88.0,
    sheetHeight: 58.0,
    maxCols: 4,
    maxRows: 4,
    maxPieces: 16,
    gap: 0,
    defaultCount: 16,
    useOriginalSize: false,
  },

  PORTALLAVES: {
    maxWidth: 19.6,
    maxHeight: 12.6,
    pieceCount: 4,
    cols: 2,
    rows: 2,
    defaultCount: 4,
    useOriginalSize: true,
    bar: {
      width: 1.5,
      height: 19.2,
      count: 4,
      hole: { diameter: 0.3, count: 4 },
    },
  },
};

/**
 * Get the target product dimensions for a given size category and aspect ratio.
 * For alargado, returns dimensions matching the image orientation (landscape or portrait).
 * @returns {{ w: number, h: number }} target dimensions in cm
 */
export function getTargetSize(aspectRatio, sizeCategory) {
  const category = sizeCategory || 'Mediano';
  const sizes = PRODUCTS.IMANES.targetSize[category];
  if (!sizes) {
    return PRODUCTS.IMANES.targetSize.Mediano.square;
  }
  if (aspectRatio < 1.5) {
    return sizes.square;
  }
  // Alargado: match orientation to image
  // If image is landscape (wider), return landscape dimensions
  const longSize = sizes.long;
  if (aspectRatio >= 1.0) {
    // Landscape image → wide target
    return { w: Math.max(longSize.w, longSize.h), h: Math.min(longSize.w, longSize.h) };
  }
  // Portrait image → tall target
  return { w: Math.min(longSize.w, longSize.h), h: Math.max(longSize.w, longSize.h) };
}

export function getDefaultCount(product, sizeCategory, aspectRatio) {
  if (product === 'IMANES') {
    const isSquare = aspectRatio < 1.5;
    const counts = isSquare ? PRODUCTS.IMANES.defaultCounts : PRODUCTS.IMANES.defaultCountLong;
    return counts[sizeCategory || 'Mediano'];
  }
  return PRODUCTS[product]?.defaultCount ?? null;
}
