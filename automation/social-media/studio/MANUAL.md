# AXKAN Studio — Complete Setup & Operations Manual

**Last updated:** 2026-04-22
**Target platform:** macOS (Apple Silicon or Intel)
**Repo:** https://github.com/Ivanvip24/axkan-social-media-studio

This manual walks through setting up AXKAN Studio on a fresh Mac from scratch, explains how it works, documents every dependency, and lists every known failure mode with its fix. If something breaks, search this file first.

---

## Table of contents

1. [What AXKAN Studio is](#what-axkan-studio-is)
2. [System requirements](#system-requirements)
3. [First-time setup on a new Mac](#first-time-setup-on-a-new-mac)
4. [Daily operation](#daily-operation)
5. [Architecture — the rules you must never break](#architecture--the-rules-you-must-never-break)
6. [File layout](#file-layout)
7. [Environment variables](#environment-variables)
8. [How each user flow works end-to-end](#how-each-user-flow-works-end-to-end)
9. [Known bugs and their fixes](#known-bugs-and-their-fixes)
10. [Diagnostic commands](#diagnostic-commands)
11. [Emergency recovery](#emergency-recovery)

---

## What AXKAN Studio is

A Flask web app at `http://localhost:8080/v2` that automates Envato AI generation (images and video) for AXKAN social-media content. The user uploads images, Claude writes Spanish/English prompts, and the studio drives Chrome via AppleScript to submit each prompt to `app.envato.com/image-gen` and `app.envato.com/video-gen`.

- **Frontend:** single-page HTML/CSS/JS app (`SOCIAL_MEDIA/studio/index_v2.html`)
- **Backend:** Flask Python app (`SOCIAL_MEDIA/studio/app.py`)
- **Automation:** per-step `osascript` subprocesses, each bound to a specific Chrome `(window_id, tab_id)` tuple
- **AI:** Claude CLI for prompt generation (and optionally Gemini for image generation)

---

## System requirements

| Requirement | Why | How to install |
|---|---|---|
| **macOS** | AppleScript automation only works on macOS | — |
| **Google Chrome** | Target browser for Envato automation | https://www.google.com/chrome/ |
| **Python 3.11+** | Flask backend (repo tested on 3.13) | `brew install python` |
| **Git** | Clone the repo | Comes with Xcode CLI tools |
| **Claude CLI** | Prompt generation | See "Install Claude CLI" below |
| **Envato Pro account** | The automation only works if you're logged in | https://www.envato.com |
| **Permissions: Accessibility** | Required so `osascript` can drive Chrome | System Settings → Privacy & Security → Accessibility |

### Install Claude CLI

```bash
# If you have npm:
npm install -g @anthropic-ai/claude-code

# Verify
claude --version
```

Then log in: `claude` (follow the prompts). The backend invokes `claude -p --system-prompt-file ...` as a subprocess, so the CLI must be on the PATH Flask inherits.

---

## First-time setup on a new Mac

### 1. Install prerequisites

```bash
# Homebrew (if you don't have it)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Python + git
brew install python@3.13 git

# Verify
python3 --version   # should be 3.11+
git --version
```

### 2. Clone the repo

```bash
cd ~/Desktop/CLAUDE    # or wherever you keep code
git clone https://github.com/Ivanvip24/axkan-social-media-studio.git
cd axkan-social-media-studio/SOCIAL_MEDIA/studio
```

### 3. Create the Python virtual environment

```bash
python3 -m venv venv
./venv/bin/pip install --upgrade pip
```

### 4. Install dependencies

Create `requirements.txt` if it doesn't exist, with these pinned versions:

```text
Flask==3.1.3
flask-cors==6.0.2
google-generativeai==0.8.6
pillow==12.2.0
requests==2.33.1
```

Then:

```bash
./venv/bin/pip install -r requirements.txt
```

If `requirements.txt` is missing, install individually:

```bash
./venv/bin/pip install flask flask-cors google-generativeai pillow requests
```

### 5. Grant Chrome automation permissions

The studio uses `osascript` to control Chrome. macOS requires permission.

1. Open **System Settings → Privacy & Security → Automation**
2. Find **Terminal** (or whatever shell you use) in the list
3. Enable **Google Chrome** under it
4. Also check **System Settings → Privacy & Security → Accessibility** and make sure Terminal / iTerm is allowed

If the first `osascript` call later asks for permission, click **OK**.

### 6. Log in to Envato

Open Chrome, go to https://app.envato.com/image-gen and make sure you're logged in. **The studio cannot submit prompts if you're not logged in** — the page redirects to a login form and the contenteditable disappears.

### 7. Start the server

```bash
./venv/bin/python3 app.py
```

You should see:

```
[AXKAN Studio] No GEMINI_API_KEY — using template fallbacks
[Watchdog] Started — monitoring Envato tabs for queue errors...
 * Running on http://127.0.0.1:8080
```

### 8. Open the UI

```bash
open http://localhost:8080/v2
```

That's the desktop-first studio. The legacy UI at `http://localhost:8080/` still works but the new features live under `/v2`.

---

## Daily operation

### Start the studio

```bash
cd ~/Desktop/CLAUDE/axkan-social-media-studio/SOCIAL_MEDIA/studio
./venv/bin/python3 app.py
```

Leave it running. The server is a dev server (`app.run`), not production — don't put it behind a public IP.

### Start it in the background

```bash
nohup ./venv/bin/python3 app.py > /tmp/axkan_server.log 2>&1 &
```

### Stop it

```bash
lsof -ti:8080 | xargs kill -9
```

### Use it

1. Open `http://localhost:8080/v2` in Chrome
2. Step 1 (Tipo): pick Imagen / Video / Pitch / Post
3. Step 2 (Detalles): destination + theme
4. Step 3 (Imágenes): drag-drop or paste ⌘V images
5. Step 4 (Prompts): Claude generates prompts. Click any card to edit. Each card has its own "→ Enviar a Envato" button.
6. Step 5 (Enviar): the big pink CTA at bottom-right fires all prompts in sequence. Per-card buttons fire independently and in parallel.

---

## Architecture — the rules you must never break

The studio has a **strict separation of concerns** enforced at runtime. If you add code that breaks these rules, the app will **crash loudly in the console** — not silently corrupt state.

### The three pillars

#### 1. ONE notebook (single source of truth)

All app state lives in `AXKAN.state`. Nothing else holds canonical state. If you need a piece of data, read it from `AXKAN.state`. Never create shadow notebooks (no private module-level variables shadowing state).

```js
AXKAN.state = {
  currentScreen:  2,
  reachedSteps:   ['tipo'],
  contentType:    null,   // 'imagen' | 'video' | 'pitch' | 'post' | 'pitch-b2b'
  subType:        null,   // 'carousel-loop' | 'personaje-hablando'
  destination:    '',
  theme:          '',

  // ── Phase 1 (always) ──
  files:          [],        // File objects for reference images (in-memory only)
  filePaths:      [],        // Server paths (persist across refresh)
  imagePrompts:   [],        // Phase 1 output: Claude's image-gen prompts
  sessionId:      null,

  // ── Phase 2 (video flows only) ──
  generatedImages:     [],   // File objects for the CURATED images the user picked
                             // from Envato ImageGen (in-memory, can't serialize)
  generatedPaths:      [],   // Server paths for curated images (in /sessions/<sid>/clean/)
  generatedSessionId:  null, // Session id Phase 2 uploads belong to
  videoPrompts:        [],   // Phase 2 output: Claude's motion prompts (+speech)

  // ── Phase selector ──
  phase:          'images',  // 'images' = Phase 1 active; 'videos' = Phase 2 active
  prompts:        [],        // Compatibility alias: points to imagePrompts (phase=images)
                             // or videoPrompts (phase=videos). Render code reads this.

  isBusy:         false,
  flowStamp:      null,      // e.g. "video:carousel-loop" — stamps prompts to their flow
}
```

#### 2. ONE secretary (actions are the only writer)

`AXKAN.state` is wrapped in a JavaScript Proxy. Writing directly throws:

```js
AXKAN.state.contentType = 'hacked';
// → Uncaught Error: [AXKAN] Direct state write is forbidden.
//   Use AXKAN.actions.* instead.
```

The only legal way to write is through `AXKAN.actions.*`:

```js
// ── Meta / flow ──
AXKAN.actions.selectContentType('imagen')
AXKAN.actions.selectSubType('carousel-loop')
AXKAN.actions.setDetails(destination, theme)
AXKAN.actions.setPhase('images'|'videos')      // switch which phase is "active"
AXKAN.actions.setReached(step)
AXKAN.actions.goToScreen(n)                     // screens 1–9
AXKAN.actions.goToDone()
AXKAN.actions.setBusy(bool)
AXKAN.actions.resetAll()

// ── Phase 1: reference images ──
AXKAN.actions.addFiles(fileList)
AXKAN.actions.removeFile(index)
AXKAN.actions.clearFiles()
AXKAN.actions.setUploaded(sessionId, filePaths)
AXKAN.actions.setImagePrompts(list)             // Phase 1 output from /api/prompts/generate

// ── Phase 2: curated images + motion prompts (video flows only) ──
AXKAN.actions.addGeneratedImages(fileList)
AXKAN.actions.removeGeneratedImage(index)
AXKAN.actions.clearGeneratedImages()
AXKAN.actions.setGeneratedUploaded(sessionId, paths)
AXKAN.actions.setVideoPrompts(list)             // Phase 2 output from /api/video-prompts/generate

// ── Prompts (phase-aware aliases) ──
AXKAN.actions.setPrompts(list)                  // routes to setImagePrompts / setVideoPrompts based on phase
AXKAN.actions.updatePrompt(index, text)         // edits current phase's prompt
```

Each action is a **checklist**: validate input → mutate → cascade-clear related fields → persist → announce via event.

For example, `selectContentType('imagen')` also clears `subType` and `prompts` (because old video prompts are invalid for an image flow) — **automatically**. You cannot forget this cleanup because it's baked into the action.

`AXKAN.actions` is frozen with `Object.freeze`. You cannot monkey-patch an action.

#### 3. ONE intercom (events, not direct calls)

Cross-component communication goes through `window.dispatchEvent`. Three channels:

| Event | Fires when | Who listens |
|---|---|---|
| `axkan:navigate` | Screen changed | DOM renderer switches visible screen |
| `axkan:state-changed` | Any action ran | UI re-renders affected panels |
| `axkan:reset` | `resetAll()` called | Every subsystem cleans its corner (sidebar stepper, thumbnails, inputs) |

If you need two features to react to the same event (e.g., "screen changed"), both subscribe — they don't try to read shared state directly.

### What NOT to do

- ❌ `AXKAN.state.foo = bar` — throws immediately
- ❌ `delete AXKAN.state.foo` — throws
- ❌ `AXKAN.actions.newAction = () => {}` — throws (actions frozen)
- ❌ Storing state in a module-level `let` alongside `AXKAN.state` — creates a shadow notebook
- ❌ `document.addEventListener('keydown', ...)` for shortcuts that other scripts also handle — use the intercom

### The dev helpers

Open the browser console on `/v2`:

```js
__axkan.state()    // snapshot of the notebook (safe JSON clone)
__axkan.reset()    // nuke localStorage + state, restart fresh
__axkan.actions    // list all 14 actions
```

### Testing the rails

These files exist for verification:

- `/tmp/axkan_proxy_test.js` (created during development — regenerate with the store-smoke-test pattern)
  - 30+ assertions: Proxy write-lock throws, actions frozen, cascade-clears work, persistence round-trips

To regenerate and run:
```bash
node /tmp/axkan_proxy_test.js  # should print "PASSED: 30"
```

---

## File layout

```
axkan-social-media-studio/
├── SOCIAL_MEDIA/
│   └── studio/
│       ├── app.py                    ← Flask backend (~3800 lines)
│       ├── index_v2.html             ← Frontend (HTML + inline JS + CSS)
│       ├── index.html                ← Legacy UI (still works at /)
│       ├── index_v2_bundle.js        ← Dead copy of inline JS (unused; safe to delete)
│       ├── test_envato.html          ← DOM-inspection harness at /test
│       ├── test_envato_passthrough.py
│       ├── CONTENT_TYPE_BEST_PRACTICES.md
│       ├── MANUAL.md                 ← THIS FILE
│       ├── axolotl_ref.jpg           ← Reference image used by some flows
│       ├── assets/                   ← Frontend static assets
│       ├── sessions/                 ← Per-session uploads (auto-created)
│       │   └── <session_id>/
│       │       └── uploads/
│       ├── tmp-ref/                  ← Ephemeral reference images (cleared per send)
│       └── venv/                     ← Python virtual environment (gitignored)
```

### What to back up

- **Everything in `sessions/`** — your uploaded images
- **No secrets in the repo** — API keys come from environment variables

### What to gitignore (already is)

- `venv/`
- `__pycache__/`
- `sessions/`
- `tmp-ref/`
- `.env`

---

## Environment variables

All optional. Set in your shell before starting the server:

| Variable | Purpose | Without it |
|---|---|---|
| `GEMINI_API_KEY` | Gemini for image generation | Falls back to template prompts |
| `ANTHROPIC_API_KEY` | Not required — Claude CLI handles auth | — |

Example:

```bash
export GEMINI_API_KEY="ya29.xxxxx"
./venv/bin/python3 app.py
```

Or put them in a local `.env` file (don't commit it):

```bash
cat > .env <<EOF
GEMINI_API_KEY=ya29.xxxxx
EOF
set -a && source .env && set +a
./venv/bin/python3 app.py
```

---

## How each user flow works end-to-end

### Flow: upload images → generate prompts → send to Envato ImageGen

```
User clicks Continuar on screen 3 (Imágenes)
  ↓
api.uploadImages(files)        [POST /api/images/upload]
  ↓ Flask saves files to sessions/<sid>/uploads/
  ↓ returns {session_id, files: [{path: "/sessions/sid/uploads/xxx.png"}, ...]}
  ↓
AXKAN.actions.setUploaded(sid, filePaths)   [persists to localStorage]
  ↓
api.generatePrompts({destination, slides, content_type, theme, is_video, session_id})
  ↓ Flask invokes `claude -p` subprocess with a system prompt file
  ↓ Claude returns JSON array of {slide_name, prompt_text, speech, ...}
  ↓
AXKAN.actions.setPrompts(list)   [normalizes shape, stamps flowStamp]
  ↓
actions.goToScreen(6)   [emits axkan:navigate]
  ↓ renderer shows Prompts screen with cards
```

### Flow: per-card "Enviar a Envato" button

```
Click "→ Enviar a Envato" on a prompt card
  ↓
sendSinglePromptToEnvato(index, btn)
  ↓ reads AXKAN.state.prompts[index] and AXKAN.state.files/filePaths
  ↓ gatherReferenceDataURLs() — tries state.files, falls back to filePaths
  ↓
POST /api/envato/send
  body: { prompt, aspectRatio, referenceImages: [dataURL, dataURL, ...] }
  ↓ backend writes refs to tmp-ref/ig-<sendid>-N.png (unique prefix per send)
  ↓ spawns daemon thread → _run_envato_imagegen_v2(prompt, urls, aspect)
  ↓
_osa_open_tab(_ENVATO_IMAGEGEN_URL)
  ↓ returns (window_id, tab_id) — tab-bound so parallel sends don't collide
  ↓ (each subsequent step runs in its own osascript subprocess targeting this tab)
  ↓
Step 1: wait for [contenteditable=true][role=textbox] (up to 8s)
Step 2: refs (if any):
  - click button[aria-label="Imágenes de referencia"]  → opens dialog
  - wait for [role=dialog] input[type=file]
  - upload all refs via native HTMLInputElement.files setter + 'change' event
  - wait for tile with envatousercontent URL (up to 24s — Envato CDN resize)
  - click first N tiles to commit as active references
  - click toggle button again to close dialog
Step 3: insert prompt via execCommand('insertText')   ← AFTER refs, never before
  - wait for input[name=prompt] hidden mirror to sync
Step 4: set aspect ratio via combobox click → option click
Step 5: click VISIBLE Generate button (two exist in DOM; one is 0x0 phantom)
  ↓
Envato fires generation. Button flips green: "✓ Enviado (N ref)"
```

### Flow: bulk CTA "Enviar a Envato"

Fires all prompts in sequence (no delay between — Envato doesn't rate-limit). Each send spawns its own tab via `_osa_open_tab`.

### Flow: Video (Carousel Loop / Personaje Hablando) — two-phase pipeline

Video content is **not a one-shot send**. It's a two-phase pipeline wired into the UI as extra screens. Envato VideoGen needs visual input (the "first frame" / "fotograma inicial") plus a short motion prompt — so we generate candidate images with Claude first, let the user curate them via Envato ImageGen, then ask Claude to write motion prompts for those exact curated images.

**User experience (all video flows):**

| # | Screen | What the user does |
|---|---|---|
| 2 | Tipo | Picks "Video" |
| 3 | Subtipo | Picks "Carousel Loop" or "Personaje hablando" |
| 4 | Detalles | Destination + theme |
| 5 | Imágenes | Uploads REFERENCE images describing the product/subject |
| 6 | Prompts imagen | Phase 1 output — IMAGE prompts. Per-card "→ Enviar a Envato" sends each to `app.envato.com/image-gen`. User runs them, downloads their favorite variations. |
| 8 | Sube generadas | Drag-and-drop (or ⌘V) the curated images downloaded from Envato. CTA unlocks at ≥ 1 image. |
| 9 | Prompts video | Phase 2 output — MOTION prompts (short, ~100 chars usable, +speech for personaje-hablando). Per-card "→ Enviar a Envato Video" sends each to `app.envato.com/video-gen` with the matching curated image as the first frame. |
| 7 | Enviar (Done) | Confirmation screen |

**Data flow under the hood:**

```
PHASE 1 — Image prompts
───────────────────────
POST /api/prompts/generate  { is_video: true, ... }
  ↓ returns [{slide_name, prompt_text, ...}]
AXKAN.actions.setImagePrompts(list)  — stores in state.imagePrompts
AXKAN.actions.setPhase('images')     — prompts alias → imagePrompts
  ↓
Screen 6 renders cards. Per-card Send hits /api/envato/send (ImageGen).
User curates results OUTSIDE the app (Envato web UI, downloads, etc.)

PHASE 2 handoff (screen 6 → 8)
──────────────────────────────
User clicks "Continuar a generadas"
  ↓ goes to screen 8 (no backend call yet — just navigation)

PHASE 2 — Video prompts
───────────────────────
User drops curated images on screen 8.
AXKAN.actions.addGeneratedImages(files) — stores in state.generatedImages
User clicks Continuar:
  ↓
POST /api/images/upload-generated  { session_id, files }
  → backend writes to sessions/<sid>/clean/   (NOT /uploads/)
  ↓ returns paths
AXKAN.actions.setGeneratedUploaded(sid, paths) — stores in state.generatedPaths
  ↓
POST /api/video-prompts/generate {
  session_id,
  content_type: 'living' | 'character',
  original_prompts: state.imagePrompts,     // Phase 1 context
  video_clip_count: state.generatedImages.length,
}
  → backend's Claude CLI reads sessions/<sid>/clean/ and writes motion prompts
  ↓ returns {video_prompts: [{video_prompt, speech, slide_name, ...}]}
AXKAN.actions.setVideoPrompts(list)       — normalizes video_prompt → prompt_text
AXKAN.actions.setPhase('videos')          — prompts alias → videoPrompts
goToScreen(9)

PHASE 3 — Send to Envato VideoGen (screen 9)
────────────────────────────────────────────
Per-card Send button:
  POST /api/envato/send-video {
    prompt: videoPrompts[i].prompt_text,
    speech: videoPrompts[i].speech,
    imagePath: generatedPaths[i],          // the curated image for this clip
    loop: (subType === 'carousel-loop'),
  }
  ↓
_run_envato_videogen_v2(prompt, ref_url, is_loop)
  → opens app.envato.com/video-gen in a tab bound to (window_id, tab_id)
  → uploads first frame (and end frame if loop), inserts motion prompt AFTER,
    sets audio, clicks Generate

Bulk CTA "Enviar a Envato Video":
  POST /api/envato/send-all-video { prompts[], speeches[], imagePaths[], loop }
  → fires all clips in parallel, each on its own tab
```

**Why two phases and not one:** Envato VideoGen's prompt field is short and describes MOTION, not the scene. The actual visual comes from the uploaded frame. Claude's second pass looks at the specific image the user picked and writes a motion prompt tailored to that exact composition.

**Sub-type differences:**

| Sub-type | # Phase 1 prompts | # Phase 2 prompts | Frames per video | Audio | Claude prompt style |
|---|---|---|---|---|---|
| `carousel-loop` | N (= uploaded refs, min 3) | = # curated images | Start + End (same image) | Sin audio | Particles, 3D motion, explosive reveals. See memory: `feedback_carousel_loop_prompts.md` |
| `personaje-hablando` | **Always 1** (user generates 3 variations in Envato) | = # curated images | Start frame only | Con audio | Natural mouth movement, subtle head turns, Spanish dialogue sync |

**Key rule enforced by the store:** if the user changes `contentType` or `subType` mid-flow, ALL Phase 1 + Phase 2 state is cascade-cleared (`imagePrompts`, `videoPrompts`, `generatedImages`, `generatedPaths`, `generatedSessionId`, `phase` reset to `'images'`). You can't accidentally send Phase 1 image prompts to Envato Video or mix curated images from a prior flow.

**Refresh behavior:**
- After refresh mid-Phase-2, `generatedImages` (File objects) are lost. `generatedPaths` persist.
- `rehydrateGeneratedFromServer()` runs on boot and re-fetches `generatedPaths` as blobs, rebuilding `generatedImages`.
- If the server session was pruned (paths 404), `setGeneratedUploaded(null, [])` clears the stale references.

### Flow: refresh persistence

On refresh:
1. Store's `restore()` reads `localStorage['axkan.studio.state.v2']`
2. `prompts`, `filePaths`, `sessionId` survive. `files` (File objects) do not — browsers can't serialize them.
3. `rehydrateFilesFromServer()` fetches `filePaths` back as blobs, wraps them in `File` objects, puts them in `state.files` via `actions.addFiles`
4. Before rehydration finishes, thumbnails render directly from the server URLs (fallback path in `renderThumbs()`)
5. User can continue normally

---

## Known bugs and their fixes

This section documents every non-trivial failure mode the studio has hit, with the root cause and the fix. Search by symptom.

### Symptom: "Nothing happens when I click the per-card Send button"

- **Server log shows `POST /api/envato/send 200` but no new Chrome tab opens**
  - You're firing parallel sends and Chrome's `active tab of front window` is shared global state.
  - **Fix**: ensure the backend is using `_run_envato_imagegen_v2` (tab-bound), NOT the older inline AppleScript template. Check that `envato_send()` in `app.py` calls `threading.Thread(target=_run_envato_imagegen_v2, ...)`.

- **New tab opens but prompt text is empty**
  - You inserted the prompt BEFORE opening the reference-images dialog. The dialog blur wipes the contenteditable.
  - **Fix**: the ref-upload step must run before the prompt insertion. Check `_run_envato_imagegen_v2` — `Step 2` (refs) must come before `Step 3` (prompt).

- **`upload_status: "no_file_input"` after send**
  - The ref dialog opened but no file input appeared in 4s. Envato may have changed the DOM, or the page didn't fully load.
  - **Fix 1**: make sure you're logged in at https://app.envato.com/image-gen (check body text for "log in").
  - **Fix 2**: the dialog file input selector is `[role=dialog] input[type=file]`. If Envato changes this, rerun the DOM inspection (see Diagnostic commands).

- **`refs_attached: 0` but no errors**
  - The upload happened but the tile-click never fired. Check if `tiles[0].querySelector('img').src` matches `envatousercontent|user-uploads` pattern.
  - **Fix**: increase the wait in `_run_envato_imagegen_v2` step 2's "wait for tiles" poll (`max_polls=80` → try 120).

### Symptom: "Prompts show as raw text, not cards"

Known frontend bug caused by CSS variables that weren't defined (`--border`, `--muted`). Fixed by hardcoding values. If it reappears, look at `.prompt-card` CSS in `index_v2.html` (~line 1041) — replace any `var(--border)` with `#E5DFCF`.

### Symptom: "Images vanish on refresh and I have to re-upload"

The studio should rehydrate files from `state.filePaths`. Check:
1. `rehydrateFilesFromServer()` is called in the init `setTimeout` (look for it in `index_v2.html` around line 2680)
2. `state.filePaths` is actually populated after upload (check `__axkan.state()` in console)
3. The server session wasn't pruned — visit `http://localhost:8080/sessions/<sid>/uploads/<name>` directly and confirm 200

### Symptom: "Direct state write is forbidden" error in console

You (or code you added) tried to write `AXKAN.state.foo = bar` directly. This is **the enforcement working as designed**. Find the line it came from (stack trace) and convert it to an action call:

```js
// Before
AXKAN.state.contentType = 'imagen';

// After
AXKAN.actions.selectContentType('imagen');
```

If no matching action exists, add one to the secretary — don't bypass the lock.

### Symptom: "⌘K does nothing"

Two keydown handlers used to fight over ⌘K (shell + backend). Fixed by removing the duplicate in the backend IIFE (line ~3516 in `index_v2.html`). If it breaks again, grep for `'k' || e.key === 'K'` and make sure only one handler toggles the palette.

### Symptom: "Nuevo proyecto" doesn't fully reset

The reset must go through `AXKAN.actions.resetAll()` and the `axkan:reset` event must fire. Verify:
1. The button calls `AXKAN.actions.resetAll()` (not a hand-rolled reset)
2. Every subsystem listens for `axkan:reset` (shell stepper, screens form inputs, etc.)

### Symptom: AppleScript errors / osascript timeouts

- **"Not authorized to send Apple events to Google Chrome"**
  - macOS permission denied.
  - **Fix**: System Settings → Privacy & Security → Automation → enable Terminal → Google Chrome.

- **"missing value"** returned from inspection
  - The JS ran but the AppleScript expected a string return. Some of our JS fragments return `undefined`.
  - **Fix**: wrap the JS in an IIFE that always returns a string (e.g., `JSON.stringify(...)` at the end).

- **AppleScript integer parse error**
  - Chrome tab IDs like `1783885408` are parsed as real numbers (`1.78e+9`) in AppleScript.
  - **Fix**: coerce both sides: `(id of t as integer) = (N as integer)`. Already done in `_osa_js`.

### Symptom: Claude CLI not found / fails

- `[ERRNO 2] No such file or directory: 'claude'` in server log
  - Claude CLI isn't on PATH that Flask inherits.
  - **Fix 1**: `which claude` — confirm it's installed.
  - **Fix 2**: if installed but Flask can't find it, start the server with a PATH-inheriting shell:
    ```bash
    ./venv/bin/python3 -c "import os; print(os.environ['PATH'])"
    ```
    Make sure the dir containing `claude` is in there. If using `nohup`, the PATH of the terminal carries over, but `launchd` / system daemons may not have it.

- Claude CLI prompts time out
  - `claude -p` is being called with `--max-turns 1` or `2`. Most prompts finish fast; if they hang, the CLI may be waiting for interactive input.
  - **Fix**: verify `claude` is logged in: run `claude` once manually from the same terminal.

### Symptom: Upload fails with "413 Request Entity Too Large"

- Default Flask limit hit. The studio raises it to 500MB (`MAX_CONTENT_LENGTH`).
- **Fix**: check `app.py` line ~45 for `app.config["MAX_CONTENT_LENGTH"] = 500 * 1024 * 1024`. If it's gone, re-add.

### Symptom: Envato dialog doesn't close

Envato ImageGen's dialog has **no close button**. The only way to close it is to click the "Imágenes de referencia" toggle button AGAIN. If the dialog stays open, check that the close step in `_generate_ref_upload_js` calls `toggle.click()` at the end.

### Symptom: Chrome opens tab but never fills it

Probably the front window changed between tab creation and JS execution. Solution: the new `_run_envato_imagegen_v2` binds to `(window_id, tab_id)` so this can't happen. If you see this, you're on an old code path — check that `envato_send()` uses the v2 orchestrator.

---

## Diagnostic commands

### Is the server running?

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/v2
# → 200 if running
```

### What's in the current Envato tab?

```bash
osascript <<'EOF'
tell application "Google Chrome"
  repeat with w in windows
    repeat with t in tabs of w
      if URL of t contains "image-gen" then
        return (execute t javascript "
          var ce = document.querySelector('[contenteditable=true][role=textbox]');
          var hp = document.querySelector('input[name=prompt]');
          var ar = document.querySelector('input[name=aspectRatio]');
          JSON.stringify({
            prompt_visible: ce ? ce.textContent.substring(0,60) : null,
            prompt_hidden: hp ? hp.value.substring(0,60) : null,
            aspect: ar ? ar.value : null,
            upload_status: window.__refUploadStatus,
            generated: window.__axkanGenerated
          });
        ")
      end if
    end repeat
  end repeat
end tell
EOF
```

### Count open Envato tabs

```bash
osascript -e 'tell application "Google Chrome"
  set n to 0
  repeat with w in windows
    repeat with t in tabs of w
      if URL of t contains "envato.com" then set n to n + 1
    end repeat
  end repeat
  return n
end tell'
```

### Close all Envato tabs

```bash
osascript -e 'tell application "Google Chrome"
  repeat with w in windows
    set toClose to {}
    repeat with t in tabs of w
      if URL of t contains "envato.com" then set end of toClose to t
    end repeat
    repeat with t in toClose
      try
        close t
      end try
    end repeat
  end repeat
end tell'
```

### Inspect frontend state

Open `http://localhost:8080/v2` in Chrome, open DevTools console:

```js
__axkan.state()                    // current notebook
AXKAN.actions                       // list actions
AXKAN.state.prompts.length          // how many prompts
AXKAN.state.filePaths               // server-side file refs
```

### Test the Proxy write-lock

```js
try { AXKAN.state.contentType = 'hack'; } catch(e) { console.log('✓ rails working:', e.message); }
// Should log: "✓ rails working: [AXKAN] Direct state write is forbidden..."
```

### Check server log

```bash
tail -30 /tmp/axkan_server.log | grep -v favicon
```

Look for `POST /api/envato/send 200` followed by `GET /tmp-ref/ig-...` (confirms Envato fetched your reference images).

### Dump Envato ImageGen DOM

Open the page, open DevTools console:

```js
JSON.stringify({
  contenteditables: Array.from(document.querySelectorAll('[contenteditable=true]')).map(e => ({role:e.getAttribute('role'), aria:e.getAttribute('aria-label')})),
  comboboxes: Array.from(document.querySelectorAll('[role=combobox]')).map(e => e.textContent.trim()),
  upload_button: !!Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('aria-label')==='Imágenes de referencia'),
  generate_buttons: Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim()==='Generar').map(b => ({disabled:b.disabled, visible:b.getBoundingClientRect().width > 0})),
}, null, 2);
```

Use this if Envato changes its DOM — it tells you which selectors still work.

---

## Emergency recovery

### The studio is totally broken and I can't open the v2 UI

1. Check server log: `tail -50 /tmp/axkan_server.log`
2. Python exception on startup? Read the traceback.
3. Syntax error in `app.py`? Revert to last commit: `git checkout app.py`
4. Frontend syntax error? Check browser console. Revert `index_v2.html`: `git checkout SOCIAL_MEDIA/studio/index_v2.html`
5. Still broken? Nuclear option:
   ```bash
   git stash
   git pull --rebase
   ./venv/bin/pip install -r requirements.txt
   ./venv/bin/python3 app.py
   ```

### localStorage is corrupted

In the browser console:

```js
localStorage.clear();
location.reload();
```

Or use the dev helper:

```js
__axkan.reset();
```

### Sessions folder is full / disk space

```bash
# List session sizes
du -sh SOCIAL_MEDIA/studio/sessions/*

# Delete sessions older than 7 days
find SOCIAL_MEDIA/studio/sessions -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +
```

### Envato changed its DOM and automation breaks

1. Open `https://app.envato.com/image-gen` in Chrome
2. Run the "Dump Envato ImageGen DOM" command from Diagnostic commands above
3. Compare against the selectors hardcoded in `_run_envato_imagegen_v2` (`app.py` around line 2432+) and `_generate_ref_upload_js` (`app.py` around line 1348+)
4. Update the selectors to match

Key selectors that must keep working:

| What | Selector |
|---|---|
| Prompt input | `[contenteditable=true][role=textbox]` |
| Hidden prompt mirror | `input[name=prompt]` |
| Upload toggle | `button[aria-label="Imágenes de referencia"]` |
| Dialog file input | `[role=dialog] input[type=file]` |
| Ref tiles | `button[aria-label="Seleccionar imagen como referencia"]` |
| Aspect combobox | `[role=combobox]` with textContent in {Vertical, Horizontal, Cuadrado} |
| Generate button | `button` with text "Generar" and `rect.width > 0` |

### I accidentally broke the Proxy rails

The Proxy is defined in the store IIFE at the top of `index_v2.html` (around lines 1350-1650). If someone replaced `AXKAN.state = stateProxy` with a raw object assignment, the rails are gone.

1. `git log -p -- SOCIAL_MEDIA/studio/index_v2.html | grep -B5 "AXKAN.state ="`
2. Revert the offending commit

---

## Appendix A: Architecture diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Browser (localhost:8080/v2)                     │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌──────────────────────┐   ┌──────────────────────────────────────┐  │
│  │   AXKAN.state        │   │   AXKAN.actions (frozen)             │  │
│  │   (Proxy-wrapped)    │←──│   - only legal writer                │  │
│  │   one notebook       │   │   - validates + cascades + persists  │  │
│  └──────────────────────┘   └──────────────────────────────────────┘  │
│           ↑                          │                                 │
│           │ read                     │ write                           │
│           │                          ↓                                 │
│  ┌──────────────────────┐   ┌──────────────────────────────────────┐  │
│  │  DOM renderers       │←──│   axkan:navigate / :state-changed /  │  │
│  │  (screens, stepper)  │   │   :reset  (one intercom)             │  │
│  └──────────────────────┘   └──────────────────────────────────────┘  │
│                                                                        │
│                          fetch /api/...                                │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                                     ↓
┌────────────────────────────────────────────────────────────────────────┐
│                       Flask backend (app.py :8080)                     │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  /api/images/upload      → sessions/<sid>/uploads/                    │
│  /api/prompts/generate   → claude -p subprocess                       │
│  /api/envato/send        → _run_envato_imagegen_v2 (daemon thread)    │
│  /api/envato/send-video  → _run_envato_videogen_v2 (daemon thread)    │
│                                                                        │
│                     spawns per-step osascript                          │
│                                   │                                    │
└───────────────────────────────────┬┴───────────────────────────────────┘
                                    │
                                    ↓
┌────────────────────────────────────────────────────────────────────────┐
│                         Google Chrome (AppleScript)                    │
│                                                                        │
│  Tab A (window_id=W1, tab_id=T1) ← bound                              │
│     → app.envato.com/image-gen                                        │
│     → prompt inserted, refs uploaded, Generate clicked                │
│                                                                        │
│  Tab B (window_id=W1, tab_id=T2) ← bound (independent)                │
│     → app.envato.com/image-gen (parallel, no collision)               │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Appendix B: Quick start cheat sheet

```bash
# Clone + setup (first time)
git clone https://github.com/Ivanvip24/axkan-social-media-studio.git
cd axkan-social-media-studio/SOCIAL_MEDIA/studio
python3 -m venv venv
./venv/bin/pip install flask flask-cors google-generativeai pillow requests

# Install Claude CLI (first time)
npm install -g @anthropic-ai/claude-code
claude   # log in

# Grant permissions (first time)
# System Settings → Privacy & Security → Automation → Terminal → ✅ Google Chrome

# Log in to Envato (first time)
open https://app.envato.com/image-gen

# Start the server (every day)
cd ~/Desktop/CLAUDE/axkan-social-media-studio/SOCIAL_MEDIA/studio
./venv/bin/python3 app.py

# Open the UI
open http://localhost:8080/v2

# Stop the server
lsof -ti:8080 | xargs kill -9
```

---

## Appendix C: Video flow glossary — the two-phase pipeline

Quick reference so you don't confuse "image prompts" with "video prompts":

- **Reference image** — what the user uploaded on screen 3. Feeds Phase 1's prompt generation so Claude knows the subject.
- **Generated image** — what Envato ImageGen returns at the end of Phase 1. User picks the best variation and saves it.
- **First frame / fotograma inicial** — the generated image, re-uploaded into Phase 2. This is what the video literally looks like at t=0.
- **End frame / fotograma final** — Carousel Loop only. Same as first frame (so the video loops back). Enables the "reverse" animation trick.
- **Motion prompt** — Claude's Phase-2 output. Short (< 100 chars usable), describes camera move / animation only, NOT the scene.
- **Speech (`speech` field)** — Personaje Hablando only. Spanish dialogue the character will lip-sync.
- **Audio mode** — "Con audio" (personaje-hablando) or "Sin audio" (carousel-loop). Set via dropdown in Envato VideoGen.

Flow check before you send:

```js
// Console check before clicking a video Enviar button
const s = __axkan.state();
console.log({
  type: s.contentType,           // must be 'video'
  sub: s.subType,                 // 'carousel-loop' or 'personaje-hablando'
  stamp: s.flowStamp,             // must match: 'video:carousel-loop' or 'video:personaje-hablando'
  prompt: s.prompts[0]?.prompt_text?.substring(0,60),
  speech: s.prompts[0]?.speech?.substring(0,60),  // empty if carousel-loop
  first_frame_path: s.filePaths[0],
});
```

---

## Appendix D: When something breaks, in order

1. **Check the server log** (`tail -30 /tmp/axkan_server.log`)
2. **Check the browser console** (⌥⌘J in Chrome) — look for `[AXKAN]` warnings/errors
3. **Check Envato is logged in** (visit https://app.envato.com/image-gen manually)
4. **Check Chrome automation permissions** (System Settings → Privacy → Automation)
5. **Run the diagnostic commands** above
6. **Search this file** for your symptom
7. If nothing matches, **inspect the live Envato DOM** (Appendix B → "Dump Envato ImageGen DOM") and compare against known selectors

---

*This manual is the source of truth for deploying and operating AXKAN Studio. If you solve a problem not documented here, add it to the "Known bugs" section so the next person doesn't waste time rediscovering it.*
