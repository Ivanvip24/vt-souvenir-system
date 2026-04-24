/**
 * ARMADO AI - Express Web Server
 * Replaces Electron with a local web server + browser UI.
 * Controls Adobe Illustrator via AppleScript (same bridge as before).
 */

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { parseCommand, validateCommand } from './src/cli/parser.js';
import { optimize, computePieceSize } from './src/nesting/optimizer.js';
import { buildProfiles, computeSpacings, findOptimalScale } from './src/nesting/profiler.js';
import { PRODUCTS, USABLE, getTargetSize, getDefaultCount } from './src/nesting/constants.js';
import * as bridge from './src/bridge/illustrator.js';
import { initAI } from './src/ai/client.js';
import { aiParseCommand } from './src/ai/ai-parser.js';
import { aiAnalyzeShape } from './src/ai/ai-shape.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3456;

// ============================================================
// EXPRESS SETUP
// ============================================================

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'app')));

// File upload config
const upload = multer({
  dest: '/tmp/armado_uploads/',
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.ai', '.png', '.jpg', '.jpeg'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Use .ai, .png, .jpg, or .jpeg'));
    }
  },
});

// SSE clients map: requestId -> response
const sseClients = new Map();

// Processing lock (bridge uses execSync, only one at a time)
let processing = false;

// ============================================================
// ROUTES
// ============================================================

// SSE endpoint for real-time status updates
app.get('/api/status/:requestId', (req, res) => {
  const { requestId } = req.params;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ message: 'Connected', type: 'info' })}\n\n`);

  sseClients.set(requestId, res);

  req.on('close', () => {
    sseClients.delete(requestId);
  });
});

// File upload (drag-and-drop or pasted image)
app.post('/api/upload', upload.single('file'), (req, res) => {
  // Handle pasted image (base64 data URL)
  if (req.body && req.body.dataUrl) {
    try {
      const matches = req.body.dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
      if (!matches) return res.status(400).json({ error: 'Invalid data URL' });
      const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
      const buffer = Buffer.from(matches[2], 'base64');
      const tempPath = `/tmp/armado_pasted_${Date.now()}.${ext}`;
      fs.writeFileSync(tempPath, buffer);
      console.log(`[SERVER] Pasted image saved to: ${tempPath}`);
      return res.json({ filePath: tempPath, fileName: `Pasted image.${ext}` });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Handle file upload
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Rename to keep original extension
  const ext = path.extname(req.file.originalname).toLowerCase();
  const newPath = req.file.path + ext;
  fs.renameSync(req.file.path, newPath);

  console.log(`[SERVER] File uploaded: ${req.file.originalname} -> ${newPath}`);
  res.json({ filePath: newPath, fileName: req.file.originalname });
});

// Main processing endpoint
app.post('/api/process', async (req, res) => {
  const { filePath, command, requestId } = req.body;

  if (processing) {
    return res.json({ error: true, message: 'Already processing. Please wait.' });
  }

  processing = true;

  function sendStatus(message, type = 'info') {
    console.log(`[STATUS] ${message}`);
    const sseRes = sseClients.get(requestId);
    if (sseRes) {
      sseRes.write(`data: ${JSON.stringify({ message, type })}\n\n`);
    }
  }

  try {
    console.log('\n========================================');
    console.log('[SERVER] New process request');
    console.log(`[SERVER]   filePath: ${filePath || '(none)'}`);
    console.log(`[SERVER]   command: "${command}"`);
    console.log('========================================');

    // Step 1: Parse command — try keyword parser first (instant), AI only if needed
    sendStatus('Interpretando comando...', 'working');
    let parsed = parseCommand(command);
    if (!parsed.product) {
      parsed = await aiParseCommand(command);
    }
    const validation = validateCommand(parsed);
    console.log(`[SERVER] Parsed:`, JSON.stringify(parsed));

    if (!validation.valid) {
      res.json({ error: true, message: validation.error });
      return;
    }

    const targetCount = parsed.count || getDefaultCount(parsed.product, parsed.sizeCategory, 1.0);
    sendStatus(`${parsed.product} | ${targetCount} piezas | ${parsed.sizeCategory || 'Mediano'}`);

    // Step 2: Check Illustrator
    const aiCheck = bridge.checkIllustrator();
    if (!aiCheck.ready) {
      res.json({ error: true, message: aiCheck.error });
      return;
    }

    // Step 3: Open file in Illustrator
    if (filePath) {
      sendStatus('Abriendo en Illustrator...', 'working');
      const ext = path.extname(filePath).toLowerCase();
      if (['.ai', '.png', '.jpg', '.jpeg'].includes(ext)) {
        bridge.openAndSelect(filePath);
      }
    }

    // Step 4: Extract original dimensions
    sendStatus('Leyendo dimensiones...');
    const origInfo = bridge.extractDesignInfo();
    if (!origInfo || origInfo.error) {
      res.json({ error: true, message: origInfo?.error || 'No se pudo leer el diseno.' });
      return;
    }

    const origAR = origInfo.pieceWidth / origInfo.pieceHeight;
    sendStatus(`Original: ${origInfo.pieceWidth.toFixed(1)}x${origInfo.pieceHeight.toFixed(1)}cm`);

    // Step 5-9: Size + Arrange
    let result;
    let target;

    if (parsed.product === 'IMANES') {
      // ============================================================
      // CELL-BASED SIZING — simple, exact, maximum size
      // 1. Find best grid for target count
      // 2. Cell size = sheet / grid (the TRUE maximum)
      // 3. Resize to cell size
      // 4. PREPARACION
      // 5. scaleFactor = cell / cutLine (guarantees fit)
      // ============================================================

      const SHEET_W = 29.9;  // usable width (30 - margins)
      const SHEET_H = 38.9;  // usable height (39 - margins)

      // Step 5: Find best grid
      let bestGrid = null;
      for (const [cols, rows] of [[4,5],[5,4],[3,7],[7,3],[2,10],[10,2],[3,6],[6,3],[4,6],[6,4],[5,5],[4,4]]) {
        if (cols * rows < targetCount) continue;
        const cellW = SHEET_W / cols;
        const cellH = SHEET_H / rows;
        // Fit design AR into cell
        const pieceW = Math.min(cellW, cellH * origAR);
        const pieceH = pieceW / origAR;
        const area = pieceW * pieceH;
        if (!bestGrid || area > bestGrid.area) {
          bestGrid = { cols, rows, cellW, cellH, pieceW, pieceH, area };
        }
      }

      console.log(`[SERVER] Best grid: ${bestGrid.cols}x${bestGrid.rows} → cell ${bestGrid.cellW.toFixed(2)}x${bestGrid.cellH.toFixed(2)} → piece ${bestGrid.pieceW.toFixed(2)}x${bestGrid.pieceH.toFixed(2)}cm`);
      sendStatus(`Grid: ${bestGrid.cols}x${bestGrid.rows} | Celda: ${bestGrid.cellW.toFixed(1)}x${bestGrid.cellH.toFixed(1)}cm`);

      // Step 6: Resize to CELL SIZE (the maximum possible)
      target = { w: bestGrid.pieceW, h: bestGrid.pieceH };
      bridge.resizeDesign(target.w, target.h);

      // Step 7: PREPARACION
      sendStatus('PREPARACION...', 'working');
      const prepResult = bridge.runPreparacion();
      if (prepResult?.error) {
        res.json({ error: true, message: prepResult.error });
        return;
      }

      // Step 8: Measure actual cut line
      const finalInfo = bridge.extractDesignInfo();
      if (!finalInfo || finalInfo.error) {
        res.json({ error: true, message: 'No se pudo leer el diseno despues de PREPARACION.' });
        return;
      }

      const cutW = finalInfo.pieceWidth;
      const cutH = finalInfo.pieceHeight;
      console.log(`[SERVER] Cut line: ${cutW.toFixed(2)}x${cutH.toFixed(2)}cm | Cell: ${bestGrid.cellW.toFixed(2)}x${bestGrid.cellH.toFixed(2)}cm`);
      sendStatus(`Corte: ${cutW.toFixed(1)}x${cutH.toFixed(1)}cm`);

      // Step 9: Compute scaleFactor = cell / cutLine
      // This makes cut line EXACTLY fit the cell. No gap. No overlap.
      const scaleFactor = Math.min(bestGrid.cellW / cutW, bestGrid.cellH / cutH);
      const finalPieceW = cutW * scaleFactor;
      const finalPieceH = cutH * scaleFactor;

      console.log(`[SERVER] scaleFactor: ${scaleFactor.toFixed(4)} → final piece: ${finalPieceW.toFixed(2)}x${finalPieceH.toFixed(2)}cm`);
      sendStatus(`Scale: ${scaleFactor.toFixed(3)} → ${finalPieceW.toFixed(1)}x${finalPieceH.toFixed(1)}cm`);

      // Build placements at CELL spacing
      const placements = [];
      for (let r = 0; r < bestGrid.rows; r++) {
        for (let c = 0; c < bestGrid.cols; c++) {
          if (placements.length >= targetCount) break;
          placements.push({
            x: c * bestGrid.cellW,
            y: r * bestGrid.cellH,
            width: cutW,
            height: cutH,
            rotation: 0,
            flip: false,
          });
        }
      }

      const utilization = (targetCount * finalPieceW * finalPieceH) / (SHEET_W * SHEET_H);

      result = {
        error: false,
        plan: {
          productType: 'IMANES',
          templatePath: '~/Desktop/TEMPLATES/ARMADOVT.ait',
          total: targetCount,
          scaleFactor,
          description: `Grid ${bestGrid.cols}x${bestGrid.rows}`,
          sheetWidth: 30,
          sheetHeight: 39,
          margin: 0.05,
          useLibretaTemplate: false,
          createBadge: true,
          createCutLineArtboard: true,
          portallavesBars: null,
          placements,
        },
        summary: {
          total: targetCount,
          pieceWidth: finalPieceW,
          pieceHeight: finalPieceH,
          pattern: `Grid ${bestGrid.cols}x${bestGrid.rows}`,
          utilization,
        },
      };

    } else {
      // Non-IMANES: use standard flow
      target = getTargetSize(origAR, parsed.sizeCategory);
      sendStatus(`Objetivo: ${target.w.toFixed(1)}x${target.h.toFixed(1)}cm`);
      bridge.resizeDesign(target.w, target.h);

      sendStatus('PREPARACION...', 'working');
      const prepResult = bridge.runPreparacion();
      if (prepResult?.error) {
        res.json({ error: true, message: prepResult.error });
        return;
      }

      const finalInfo = bridge.extractDesignInfo();
      if (!finalInfo || finalInfo.error) {
        res.json({ error: true, message: 'No se pudo leer el diseno despues de PREPARACION.' });
        return;
      }
      sendStatus(`Pieza: ${finalInfo.pieceWidth.toFixed(1)}x${finalInfo.pieceHeight.toFixed(1)}cm`);

      sendStatus('Calculando arreglo...', 'working');
      result = optimize({
        pieceWidth: finalInfo.pieceWidth,
        pieceHeight: finalInfo.pieceHeight,
        overallWidth: finalInfo.overallWidth,
        overallHeight: finalInfo.overallHeight,
        productType: parsed.product,
        targetCount,
        sizeCategory: parsed.sizeCategory,
        rankedPatterns: null,
      });
    }

    if (result.error) {
      res.json({ error: true, message: result.message });
      return;
    }

    console.log(`[SERVER] Step 9 - Plan: ${result.plan.total} pieces, ${result.plan.description}`);
    sendStatus(`${result.summary.total} piezas | ${result.summary.pattern}`);

    // Step 10: Execute ARMADO
    sendStatus('Placing pieces in Illustrator...', 'working');

    // Re-open source and select for copy
    bridge.openAndSelect(filePath);

    if (parsed.product === 'LIBRETA') {
      result.plan.scaleFactor = Math.min(
        PRODUCTS.LIBRETA.pieceWidth / result.summary.pieceWidth,
        PRODUCTS.LIBRETA.pieceHeight / result.summary.pieceHeight
      );
    }

    const execResult = bridge.executeArmado(result.plan);
    if (execResult?.error) {
      res.json({ error: true, message: execResult.error });
      return;
    }

    sendStatus('Armado complete!', 'success');

    const utilPct = (result.summary.utilization * 100).toFixed(1);
    console.log(`[SERVER] SUCCESS! ${result.summary.total} ${parsed.product} placed | ${utilPct}% utilization`);

    res.json({
      error: false,
      data: {
        total: result.summary.total,
        pieceWidth: result.summary.pieceWidth.toFixed(1),
        pieceHeight: result.summary.pieceHeight.toFixed(1),
        pattern: result.summary.pattern,
        utilization: utilPct,
        product: parsed.product,
        verification: null,
      },
    });

  } catch (err) {
    console.log(`[SERVER] EXCEPTION: ${err.message}`);
    res.json({ error: true, message: err.message || 'Unknown error occurred.' });
  } finally {
    processing = false;
    // Close SSE connection
    const sseRes = sseClients.get(requestId);
    if (sseRes) {
      sseRes.write(`data: ${JSON.stringify({ message: '__done__', type: 'done' })}\n\n`);
    }
  }
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, async () => {
  initAI();
  console.log(`\n[ARMADO AI] Server running at http://localhost:${PORT}`);
  console.log('[ARMADO AI] Opening browser...\n');

  // Auto-open browser
  try {
    const open = (await import('open')).default;
    open(`http://localhost:${PORT}`);
  } catch {
    console.log('[ARMADO AI] Could not auto-open browser. Navigate to http://localhost:' + PORT);
  }
});

// Cleanup on exit
process.on('SIGINT', () => {
  bridge.cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  bridge.cleanup();
  process.exit(0);
});
