# Envato History Downloader — Methodology

## What This Does

Bulk-downloads every image from your `app.envato.com/generation-history`
account into a local folder. Then (optionally) classifies each image with
Claude using a contact-sheet trick that's ~50x faster than per-image reads.

Two phases:

1. **Download** — drives your already-logged-in Chrome tab via AppleScript,
   auto-scrolls the virtualized list to the bottom, scrapes every gen-asset
   URL, parallel-curls them to disk.
2. **Classify** (optional) — generates 256px thumbnails, tiles them onto
   labeled contact sheets, hands sheets to Claude in parallel for batch
   classification.

## Quick Start

```bash
# 1. Open https://app.envato.com/generation-history in Google Chrome (logged in)
# 2. Run:
./envato_download_all.sh
# Files land in ~/Downloads/envato-designs/

# 3. (Optional) Build classification contact sheets:
python3 make_contact_sheets.py ~/Downloads/envato-designs
# Sheets land in ~/Downloads/envato-designs/_grids/sheet_*.jpg

# 4. Hand each sheet to a Claude agent (one per sheet, run in parallel).
#    Each agent reads ONE sheet = ~72 classifications in a single Read.
```

## Why Each Step Looks the Way It Does

This tool exists because of three hard constraints. Understanding them
explains every design choice.

### Constraint 1: No browser, no API

Claude Code has no browser of its own. It can't navigate to
`app.envato.com`, click thumbnails, or pull images from a logged-in
account. There is also no public Envato API that exposes generation
history — the page is a private user-account view.

**The workaround**: macOS `osascript` lets us hand JavaScript to *your
already-open Chrome tab*. Your cookies stay in your browser; we just
inject a scroll-and-scrape script. That's why this tool is macOS-only
and why you must have Chrome with the page open before running it.

### Constraint 2: Envato CDN URLs are signed for one specific size

Every generated asset is served from
`gen-assets-resized.envatousercontent.com/.../<batch-id>/<image-id>?w=1024&...&s=<sig>`.
The `?s=...` signature is bound to `?w=1024`. Any attempt to upscale
returns `403 Forbidden`. The unresized origin (`gen-assets.envatousercontent.com`,
no `-resized`) is unreachable from the public internet.

**Implication**: 1024×1024 JPEG at q=80 is the ceiling. There is no
"download original" option. This is what Envato itself shows you in
the UI — there's nothing larger to fetch.

### Constraint 3: Cumulative image-context limits in classification

This is the constraint that drove the contact-sheet design.

When Claude reads images via the `Read` tool, each image counts against
a per-conversation cumulative budget. Around the ~80th 1024px image,
the agent crashes with:

> An image in the conversation exceeds the dimension limit for many-image requests (2000px).

The error message points at "an image" but the trigger is *cumulative
bytes/dimensions across the conversation*, not any single image. Once
you trip it, that agent is done.

We hit this twice:

- **Attempt 1** — one agent, 586 sequential reads. Crashed at #80.
- **Attempt 2** — six parallel agents, 100 reads each. Four finished;
  two crashed at the limit.

#### The contact-sheet solution

Instead of N reads, do `ceil(N/72)` reads:

1. Downsample each 1024px original to 256px with `sips` (4x reduction).
2. Tile 72 thumbnails (`8 cols × 9 rows`) onto a single 1436×1813 sheet.
3. Print the leading 4-digit filename ID under each thumb.
4. Hand the sheet to Claude. One Read = 72 classifications.

Sheet dimensions are deliberately tuned to stay under 2000×2000 (the
hard cap). At 8×9 with 175px cells we get 1436×1813 — comfortable
margin. A 10×10 grid trips the limit on its own.

#### Result

- 9 sheets covered all 586 images
- 9 agents in parallel finished in **~14-30 seconds wall-clock** (slowest sheet ~5 min when an agent did extra verification reads)
- Compare to the original sequential approach: ~12-15 min per chunk × 6 chunks = ~75 min total, with 2 chunks failing

That's roughly the optimal shape for this problem under our constraints.

## Files

| File | Role |
|------|------|
| `envato_download_all.sh` | Entry point. Drives Chrome, scrapes URLs, parallel-curls JPEGs. |
| `envato_scrape.applescript` | Finds the Envato Chrome tab, runs the JS, polls for completion, returns URLs. |
| `envato_scrape.js` | Browser-side: detects all scrollable containers, scrolls each to bottom, dispatches wheel events, collects every gen-asset `<img>` src. Stops when no new images appear for 12 stable rounds (or 400 iterations). |
| `make_contact_sheets.py` | Generates 256px thumbnails (via `sips`), then tiles them into 8×9 labeled grids for classification. |

## Edge Cases We Hit & Fixes

| Symptom | Root cause | Fix |
|---------|-----------|-----|
| Only ~35 images scraped of ~600 | Chrome was throttling the backgrounded tab; lazy-loader paused. | AppleScript brings the Envato tab to foreground (`activate` + `set index of w to 1`) before scrolling. |
| `set st to ...` AppleScript error | `st` is a reserved word. | Renamed to `pollResult`. |
| Bash heredoc syntax error in earlier downloader | Embedded JS quotes collided with bash heredoc parser. | Moved AppleScript and JS to separate files; bash never sees the JS source. |
| Bing-downloader script failed for Envato | Bing scraper has no auth and Envato's history is private. | This is the whole reason this tool exists — it's a different, AppleScript-driven pattern, not a Bing variant. |
| Sub-agents denied write access to `/tmp/` | Harness blocks writes outside project dirs. | Output files written under the project directory or `~/Downloads/envato-designs/`. |
| OCR misreads on contact-sheet labels (`0302` → `4302`) | Classifier occasionally misreads the leading digit on label bands. | If matching label IDs to filenames, fall back to replacing the leading digit with `0` when no file matches. |

## When to Use This vs. `tools/image-downloader/`

| Use this tool | Use `tools/image-downloader/` |
|---------------|------------------------------|
| Pulling your own generated content from Envato | Public web image search (Bing) |
| Auth-required, account-private pages | Public images |
| You're already logged in to Chrome | No login required |

## Limitations

- **macOS only** (uses `osascript` and `sips`). Linux/Windows would need
  an alternative browser-driving approach (CDP, Puppeteer with persisted
  profile, etc.).
- **Resolution capped at 1024px** by Envato signing.
- **Requires Chrome** with the generation-history page open and logged in
  before running.
- The contact-sheet classifier is best for *coarse* labels (destination
  vs. not-destination, city names). For fine-grained details (color,
  composition, exact text content) you still want individual reads.
