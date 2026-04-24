import convert from 'heic-convert';

/**
 * Check if a file is HEIC/HEIF format based on mimetype or filename
 */
export function isHeicFile(file) {
  const mime = (file.mimetype || '').toLowerCase();
  const name = (file.originalname || '').toLowerCase();
  return mime === 'image/heic' || mime === 'image/heif' || name.endsWith('.heic') || name.endsWith('.heif');
}

/**
 * Convert a HEIC/HEIF buffer to JPEG buffer
 * Returns { buffer, mimetype } with the converted data
 */
export async function convertHeicToJpeg(inputBuffer) {
  const outputBuffer = await convert({
    buffer: Buffer.from(inputBuffer),
    format: 'JPEG',
    quality: 0.92
  });
  return {
    buffer: Buffer.from(outputBuffer),
    mimetype: 'image/jpeg'
  };
}
