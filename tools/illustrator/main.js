import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseCommand, validateCommand } from './src/cli/parser.js';
import { optimize } from './src/nesting/optimizer.js';
import { PRODUCTS, USABLE, getTargetSize, getDefaultCount } from './src/nesting/constants.js';
import * as bridge from './src/bridge/illustrator.js';
import { initAI } from './src/ai/client.js';
import { aiParseCommand } from './src/ai/ai-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 700,
    minWidth: 420,
    minHeight: 500,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#FAFAF8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'app', 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}


app.whenReady().then(() => {
  initAI();
  createWindow();
});

app.on('window-all-closed', () => {
  bridge.cleanup();
  app.quit();
});

// ============================================================
// IPC HANDLERS
// ============================================================

function sendStatus(event, message, type = 'info') {
  event.sender.send('armado:status', { message, type });
}

// Save pasted image to temp file
ipcMain.handle('armado:savePastedImage', async (_event, dataUrl) => {
  try {
    const fs = await import('fs');
    const matches = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
    if (!matches) return null;
    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    const tempPath = `/tmp/armado_pasted_${Date.now()}.${ext}`;
    fs.writeFileSync(tempPath, buffer);
    console.log(`[MAIN] Pasted image saved to: ${tempPath}`);
    return tempPath;
  } catch (err) {
    console.log(`[MAIN] Failed to save pasted image: ${err.message}`);
    return null;
  }
});

ipcMain.handle('armado:process', async (event, { filePath, command }) => {
  try {
    console.log('\n========================================');
    console.log('[MAIN] ▶ New armado:process request');
    console.log(`[MAIN]   filePath: ${filePath || '(none)'}`);
    console.log(`[MAIN]   command: "${command}"`);
    console.log('========================================');

    // Step 1: AI Parse command
    sendStatus(event, 'Interpretando comando...', 'working');
    const parsed = await aiParseCommand(command);
    const validation = validateCommand(parsed);
    console.log(`[MAIN] Step 1 - Parsed:`, JSON.stringify(parsed));
    console.log(`[MAIN] Step 1 - Valid: ${validation.valid}${validation.error ? ' | Error: ' + validation.error : ''}`);

    if (!validation.valid) {
      return { error: true, message: validation.error };
    }

    sendStatus(event, `Product: ${parsed.product}${parsed.count ? ` | ${parsed.count} pieces` : ''}`);

    // Step 2: Check Illustrator
    sendStatus(event, 'Checking Illustrator...');
    const aiCheck = bridge.checkIllustrator();
    console.log(`[MAIN] Step 2 - Illustrator ready: ${aiCheck.ready}${aiCheck.error ? ' | ' + aiCheck.error : ''}`);
    if (!aiCheck.ready) {
      return { error: true, message: aiCheck.error };
    }

    // Step 3: Open file
    if (filePath) {
      const ext = path.extname(filePath).toLowerCase();
      if (['.ai', '.png', '.jpg', '.jpeg'].includes(ext)) {
        sendStatus(event, `Abriendo ${path.basename(filePath)}...`);
        const openResult = bridge.openAndSelect(filePath);
        console.log(`[MAIN] Step 3 - Opened:`, JSON.stringify(openResult));
      }
    }

    // Step 4: Extract dimensions and determine shape type
    sendStatus(event, 'Leyendo dimensiones...');
    const origInfo = bridge.extractDesignInfo();
    if (!origInfo || origInfo.error) {
      return { error: true, message: origInfo?.error || 'No se pudo leer el diseno.' };
    }

    const origAR = origInfo.pieceWidth / origInfo.pieceHeight;
    const shapeType = origAR < 1.5 ? 'square' : 'long';
    console.log(`[MAIN] Step 4 - Original: ${origInfo.pieceWidth.toFixed(2)}x${origInfo.pieceHeight.toFixed(2)}cm (AR ${origAR.toFixed(2)}, ${shapeType})`);
    sendStatus(event, `Original: ${origInfo.pieceWidth.toFixed(1)}x${origInfo.pieceHeight.toFixed(1)}cm (${shapeType === 'square' ? 'cuadrado' : 'alargado'})`);

    // Step 5: Get target size from product guide and resize
    const target = getTargetSize(origAR, parsed.sizeCategory);
    const targetCount = parsed.count || getDefaultCount(parsed.product, parsed.sizeCategory, origAR);
    console.log(`[MAIN] Step 5 - Target: ${target.w}x${target.h}cm, count=${targetCount}`);
    sendStatus(event, `Tamano objetivo: ${target.w}x${target.h}cm (${parsed.sizeCategory || 'Mediano'})`);

    bridge.resizeDesign(target.w, target.h);

    // Step 6: PREPARACION
    sendStatus(event, 'Ejecutando PREPARACION...', 'working');
    const prepResult = bridge.runPreparacion();
    if (prepResult?.error) {
      return { error: true, message: prepResult.error };
    }

    const finalInfo = bridge.extractDesignInfo();
    if (!finalInfo || finalInfo.error) {
      return { error: true, message: 'No se pudo leer el diseno despues de PREPARACION.' };
    }
    console.log(`[MAIN] Step 6 - Post-prep: ${finalInfo.pieceWidth.toFixed(2)}x${finalInfo.pieceHeight.toFixed(2)}cm`);
    sendStatus(event, `Pieza: ${finalInfo.pieceWidth.toFixed(1)}x${finalInfo.pieceHeight.toFixed(1)}cm`);

    // Size check: warn if piece is significantly smaller than target
    const targetMaxDim = Math.max(target.w, target.h);
    const actualMaxDim = Math.max(finalInfo.pieceWidth, finalInfo.pieceHeight);
    if (actualMaxDim < targetMaxDim * 0.85) {
      const wMm = (finalInfo.pieceWidth * 10).toFixed(0);
      const hMm = (finalInfo.pieceHeight * 10).toFixed(0);
      const targetStr = `${target.w}x${target.h}cm`;
      sendStatus(event, `⚠ La pieza mide ${wMm}x${hMm}mm (objetivo: ${targetStr}). El diseno no llena el tamano alargado completo.`, 'warning');
      console.log(`[MAIN] Size warning: actual ${wMm}x${hMm}mm vs target ${targetStr}`);
    }

    // Step 9: Optimize (all patterns, no AI strategy)
    sendStatus(event, 'Calculando arreglo optimo...');
    console.log(`[MAIN] Step 9 - Optimizing: product=${parsed.product}, cutLine=${finalInfo.pieceWidth.toFixed(1)}x${finalInfo.pieceHeight.toFixed(1)}, overall=${finalInfo.overallWidth.toFixed(1)}x${finalInfo.overallHeight.toFixed(1)}, target=${targetCount}`);

    // Use CUT LINE bounds for spacing — rebases naturally overlap
    const result = optimize({
      pieceWidth: finalInfo.pieceWidth,
      pieceHeight: finalInfo.pieceHeight,
      overallWidth: finalInfo.overallWidth,
      overallHeight: finalInfo.overallHeight,
      productType: parsed.product,
      targetCount,
      sizeCategory: parsed.sizeCategory,
      rankedPatterns: null,
    });

    if (result.error) {
      console.log(`[MAIN] Step 9 - Optimizer FAILED: ${result.message}`);
      return { error: true, message: result.message };
    }

    console.log(`[MAIN] Step 9 - Plan: ${result.plan.total} pieces, ${result.plan.description}`);
    sendStatus(event, `${result.summary.total} piezas | ${result.summary.pattern}`);

    // Step 10: Execute ARMADO in Illustrator
    sendStatus(event, 'Placing pieces in Illustrator...', 'working');

    // For LIBRETA, set correct scale factor from actual design
    if (parsed.product === 'LIBRETA') {
      const scaleW = PRODUCTS.LIBRETA.pieceWidth / finalInfo.pieceWidth;
      const scaleH = PRODUCTS.LIBRETA.pieceHeight / finalInfo.pieceHeight;
      result.plan.scaleFactor = Math.min(scaleW, scaleH);
      console.log(`[MAIN] Step 10 - LIBRETA scale factor: ${result.plan.scaleFactor.toFixed(4)}`);
    }

    console.log(`[MAIN] Step 10 - Executing armado with ${result.plan.placements?.length || 0} placements...`);
    const execResult = bridge.executeArmado(result.plan);
    console.log(`[MAIN] Step 10 - executeArmado result:`, JSON.stringify(execResult)?.substring(0, 200));

    if (execResult?.error) {
      return { error: true, message: execResult.error };
    }

    // TODO: Step 11 - Save file (to be implemented)
    sendStatus(event, 'Armado complete.', 'working');

    // Step 12: Return success
    const utilPct = (result.summary.utilization * 100).toFixed(1);
    console.log(`[MAIN] SUCCESS! ${result.summary.total} ${parsed.product} placed | ${utilPct}% utilization`);
    console.log('========================================\n');

    return {
      error: false,
      data: {
        total: result.summary.total,
        pieceWidth: result.summary.pieceWidth.toFixed(1),
        pieceHeight: result.summary.pieceHeight.toFixed(1),
        pattern: result.summary.pattern,
        utilization: utilPct,
        product: parsed.product,
        savedTo: null,
      },
    };

  } catch (err) {
    console.log(`[MAIN] ✗ EXCEPTION: ${err.message}`);
    console.log(`[MAIN]   Stack: ${err.stack?.substring(0, 300)}`);
    console.log('========================================\n');
    return { error: true, message: err.message || 'Unknown error occurred.' };
  }
});
