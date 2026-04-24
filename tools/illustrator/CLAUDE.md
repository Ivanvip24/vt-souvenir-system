# Illustrator AI — Smart Arrangement System

Automates product arrangement in Adobe Illustrator using Claude AI analysis.

## Commands

```bash
npm install
npm start            # Launch Express server + open browser
npm run dev          # Dev mode with Electron
```

## Tech

- Node.js + Express 5.2.1
- Claude API (@anthropic-ai/sdk 0.39.0) for AI analysis
- Adobe Illustrator ExtendScript (JSX) for arrangement execution
- AppleScript bridge for Illustrator communication
- Electron 33.0.0 for desktop app (dev)

## Key Files

- `server.js` — Express API server
- `main.js` — Electron entry point
- `jsx/` — Illustrator scripts (armado, preparacion, nesting)
- `src/ai/` — Claude AI integration (evaluator, parser, strategist)
- `src/nesting/` — Arrangement engine + patterns (grid, brick-wall, tete-beche)
- `src/bridge/` — AppleScript ↔ Illustrator communication
- `app/` — Web UI for arrangement interface

## How It Works

1. User loads an Illustrator file
2. `extract_info.jsx` reads piece dimensions
3. Claude AI analyzes and suggests optimal arrangement
4. `armado_execute.jsx` places pieces on the sheet
5. User confirms and saves
