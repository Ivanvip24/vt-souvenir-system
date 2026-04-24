/**
 * High-level Illustrator bridge API.
 * Provides simple async methods to interact with Illustrator.
 *
 * Pipeline order:
 *   1. checkIllustrator()   - Verify Illustrator is running
 *   2. openAndSelect()      - Open file and select all
 *   3. extractDesignInfo()  - Get piece dimensions
 *   4. resizeDesign()       - Resize to target size
 *   5. runPreparacion()     - Add cut line + rebase
 *   6. testOverlap()        - Pathfinder-based safe overlap measurement
 *   7. extractShapeInfo()   - Shape metrics for AI (flip/rotation/nesting)
 *   8. executeArmado()      - Arrange pieces on sheet
 *   9. saveFile()           - Save the result
 */

import { isIllustratorRunning, runJSX, cleanup } from './applescript-runner.js';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JSX_DIR = path.resolve(__dirname, '../../jsx');

/**
 * Check if Illustrator is ready (running with a document open).
 */
export function checkIllustrator() {
  if (!isIllustratorRunning()) {
    return { ready: false, error: 'Adobe Illustrator is not running. Please open it first.' };
  }
  return { ready: true };
}

/**
 * Open a file in Illustrator and select all items.
 * Uses AppleScript for reliable file opening, then JSX for selection.
 */
export function openAndSelect(filePath) {
  // First: close any existing doc with same name (avoid stale data)
  // Then: open via AppleScript (more reliable than JSX app.open for PNGs)
  try {
    const escapedPath = filePath.replace(/'/g, "'\\''");
    execSync(`osascript -e 'tell application "Adobe Illustrator"
      activate
      open POSIX file "${escapedPath}"
    end tell'`, { timeout: 30000, encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    // Try once more
    execSync('sleep 2');
    const escapedPath = filePath.replace(/'/g, "'\\''");
    execSync(`osascript -e 'tell application "Adobe Illustrator"
      activate
      open POSIX file "${escapedPath}"
    end tell'`, { timeout: 30000, encoding: 'utf8', stdio: 'pipe' });
  }

  execSync('sleep 2'); // Let document fully load

  // Select all items via JSX
  const result = runJSX(path.join(JSX_DIR, 'select_all.jsx'));
  if (result?.error) {
    throw new Error(result.error);
  }
  return result;
}

/**
 * Extract design info from the current selection in Illustrator.
 * Returns: { pieceWidth, pieceHeight, aspectRatio, hasRedLines }
 */
export function extractDesignInfo() {
  const result = runJSX(path.join(JSX_DIR, 'extract_info.jsx'));
  if (result?.error) {
    throw new Error(result.error);
  }
  return result;
}

/**
 * Resize the current selection to target dimensions (in cm).
 * Scales uniformly to fit within targetWidth x targetHeight.
 * @param {number} targetWidth - Target width in cm
 * @param {number} targetHeight - Target height in cm
 */
export function resizeDesign(targetWidth, targetHeight) {
  const result = runJSX(path.join(JSX_DIR, 'resize_design.jsx'), { targetWidth, targetHeight });
  if (result?.error) {
    throw new Error(result.error);
  }
  return result;
}

/**
 * Test the maximum safe horizontal overlap between adjacent pieces.
 * Uses Pathfinder Intersect to check actual path collision.
 * Returns the exact safe overlap in cm.
 */
export function testOverlap() {
  const result = runJSX(path.join(JSX_DIR, 'test_overlap.jsx'));
  if (result?.error) {
    throw new Error(result.error);
  }
  return result;
}

/**
 * Test overlap with Pathfinder Intersect — 4 configurations.
 * Uses Illustrator's real geometry engine. Returns exact safe overlap per config.
 */
export function testOverlapFlip() {
  const result = runJSX(path.join(JSX_DIR, 'test_overlap_flip.jsx'));
  if (result?.error) {
    throw new Error(result.error);
  }
  return result;
}

/**
 * Place 2-4 test pieces for visual verification.
 */
export function testPlacement(plan) {
  const result = runJSX(path.join(JSX_DIR, 'test_placement.jsx'), plan);
  if (result?.error) {
    throw new Error(result.error);
  }
  return result;
}

/**
 * Take a screenshot of the active Illustrator window.
 * Returns the path to the screenshot file.
 */
export function screenshotIllustrator() {
  const screenshotPath = '/tmp/armado_test_screenshot.png';
  // Bring Illustrator to front then capture entire screen (no interaction needed)
  execSync(`osascript -e 'tell application "Adobe Illustrator" to activate'`, { timeout: 5000 });
  execSync('sleep 1');
  // -x flag = no sound, no interaction, captures full screen
  execSync(`screencapture -x "${screenshotPath}"`, {
    timeout: 10000,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return screenshotPath;
}

/**
 * Close the active document without saving.
 */
export function closeDocument() {
  try {
    execSync(`osascript -e 'tell application "Adobe Illustrator" to close document 1 saving no'`, {
      timeout: 10000, encoding: 'utf8', stdio: 'pipe'
    });
  } catch {}
}

/**
 * Extract full bezier contour data from the red cut line.
 * Returns anchor points + bezier handles for profile-based nesting.
 */
export function extractContour() {
  const result = runJSX(path.join(JSX_DIR, 'extract_contour.jsx'));
  if (result?.error) {
    throw new Error(result.error);
  }
  return result;
}

/**
 * Extract shape analysis data from the red cut line after PREPARACION.
 * Returns fill ratio, symmetry, and outline points for AI analysis.
 */
export function extractShapeInfo() {
  const result = runJSX(path.join(JSX_DIR, 'extract_shape.jsx'));
  if (result?.error) {
    throw new Error(result.error);
  }
  return result;
}

/**
 * Run the PREPARACION workflow on the current selection.
 */
export function runPreparacion() {
  const result = runJSX(path.join(JSX_DIR, 'preparacion_execute.jsx'));
  if (result?.error) {
    throw new Error(result.error);
  }
  return result;
}

/**
 * Execute the ARMADO arrangement in Illustrator.
 * @param {Object} plan - The arrangement plan from the optimizer
 */
export function executeArmado(plan) {
  const result = runJSX(path.join(JSX_DIR, 'armado_execute.jsx'), plan);
  if (result?.error) {
    throw new Error(result.error);
  }
  return result;
}

/**
 * Save the active document to a specified path.
 * @param {string} savePath - Full path including filename.ai
 */
export function saveFile(savePath) {
  const result = runJSX(path.join(JSX_DIR, 'save_file.jsx'), { savePath });
  if (result?.error) {
    throw new Error(result.error);
  }
  return result;
}

export { cleanup };
