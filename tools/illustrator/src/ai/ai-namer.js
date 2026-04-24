/**
 * AI-powered file naming and folder selection (Layer 4).
 * Analyzes the source filename to generate a descriptive Spanish name
 * and pick the correct destination subfolder.
 */

import { askClaudeJSON, isAIAvailable } from './client.js';
import { existsSync, mkdirSync, readdirSync } from 'fs';
import path from 'path';

const BASE_DIR = '/Volumes/TRABAJOS/2026/ARMADOS';

const PRODUCT_FOLDERS = {
  IMANES: 'IMANES',
  LLAVEROS: 'LLAVEROS',
  DESTAPADOR: 'DESTAPADORES',
  LIBRETA: 'LIBRETAS',
  PORTALLAVES: 'PORTALLAVES',
};

function getExistingFolders(productType) {
  const productDir = path.join(BASE_DIR, PRODUCT_FOLDERS[productType] || productType);
  if (!existsSync(productDir)) return [];
  try {
    return readdirSync(productDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort();
  } catch { return []; }
}

const SYSTEM_PROMPT = `Eres un asistente para una empresa de souvenirs mexicanos (AXKAN).
Analiza el nombre del archivo de diseño y genera:

1. "folder": La carpeta destino. Si el diseño es de un lugar turístico mexicano, usa ese nombre en MAYÚSCULAS (ej: CANCUN, COZUMEL, OAXACA). Si no es un lugar, usa una categoría descriptiva (ej: MASCOTAS, LOGOS, PERSONAJES, EVENTOS).
2. "filename": Nombre descriptivo del archivo en 3-4 palabras en español, lenguaje común. Debe describir los elementos principales del diseño. Ejemplo: "Tortuga Marina Cancun", "Jaguar Selva Maya", "Escudo Campeche Colonial".

Reglas:
- folder siempre en MAYÚSCULAS sin acentos (CANCUN no CANCÚN)
- filename en Title Case con acentos naturales
- Si el nombre del archivo contiene el nombre de un lugar mexicano, úsalo como folder
- Si hay una lista de carpetas existentes, prefiere usar una existente si aplica
- No incluyas la extensión del archivo en el filename

Responde SOLO con JSON:
{"folder":"NOMBRE","filename":"Descripcion Corta Diseño"}`;

/**
 * Generate save path for the finished ARMADO file.
 * @param {string} sourceFileName - Original filename (e.g. "whatsapp_logo.png")
 * @param {string} productType - IMANES, LLAVEROS, etc.
 * @param {number} pieceCount - Number of pieces
 * @returns {{ savePath: string, folder: string, filename: string }}
 */
export async function generateSavePath(sourceFileName, productType, pieceCount) {
  const productFolder = PRODUCT_FOLDERS[productType] || productType;
  const productDir = path.join(BASE_DIR, productFolder);
  const existingFolders = getExistingFolders(productType);

  let folder = 'GENERAL';
  let filename = `ARM ${sourceFileName.replace(/\.[^.]+$/, '')}`;

  if (isAIAvailable()) {
    console.log('[AI-NAMER] Generating file name...');
    const userMsg = `Archivo: "${sourceFileName}"\nProducto: ${productType}\nPiezas: ${pieceCount}\nCarpetas existentes: ${existingFolders.slice(0, 50).join(', ')}`;
    const result = await askClaudeJSON(SYSTEM_PROMPT, userMsg);

    if (result?.folder && result?.filename) {
      folder = result.folder.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      filename = `ARM ${result.filename}`;
      console.log(`[AI-NAMER] → folder: ${folder} | file: ${filename}`);
    } else {
      console.log('[AI-NAMER] AI returned unusable result. Using filename fallback.');
    }
  }

  const destDir = path.join(productDir, folder);
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
    console.log(`[AI-NAMER] Created folder: ${destDir}`);
  }

  const savePath = path.join(destDir, `${filename}.ai`);
  return { savePath, folder, filename };
}
