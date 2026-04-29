#!/bin/bash
# Single coaching run — invoked by launchd every 30 minutes
# Calls Claude Code in print mode to analyze conversations and store pills

set -e

PROJECT_DIR="/Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/axkan_brain_system"
cd "$PROJECT_DIR"

# Ensure claude is on PATH
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.claude/bin:$HOME/.npm-global/bin:$PATH"

# Check if claude CLI is available
if ! command -v claude &>/dev/null; then
  echo "[$(date)] ERROR: claude CLI not found in PATH"
  exit 1
fi

echo "[$(date)] Starting sales coaching run..."

# Step 1: Fetch conversations needing coaching
FETCH_OUTPUT=$(node backend/scripts/sales-coaching-local.js fetch 2>&1)

if echo "$FETCH_OUTPUT" | grep -q "NO_CONVERSATIONS_NEED_COACHING"; then
  echo "[$(date)] No conversations need coaching. Done."
  exit 0
fi

CONV_COUNT=$(echo "$FETCH_OUTPUT" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');try{console.log(JSON.parse(d).length)}catch{console.log(0)}")

if [ "$CONV_COUNT" = "0" ]; then
  echo "[$(date)] No valid conversations. Done."
  exit 0
fi

echo "[$(date)] Found $CONV_COUNT conversations to analyze."

# Step 2: Let Claude Code analyze and generate pills
PILLS=$(claude -p --dangerously-skip-permissions "You are a sales coach for AXKAN (custom souvenirs, MDF laser-cut, Mexico).

RULES — never break these:
- NEVER suggest discounts or special prices
- NEVER break minimum quantities (100 pieces per design)
- NEVER promise faster delivery
- Fixed prices: imanes \$11/ea (100pz), llaveros \$10/ea (100pz), destapadores \$20/ea (100pz)
- Catalog: axkan.art/productos | Orders: axkan.art/pedidos

Analyze each conversation below. For each, output a coaching pill.
Suggested messages: 1-2 lines, casual Mexican Spanish, like a real person texting.
If no intervention needed (client just responded, all going well), use coachingType: none.

OUTPUT: a raw JSON array (no markdown, no backticks, ONLY the array).
Each element: {\"conversationId\": <number>, \"coachingType\": \"cold_lead\"|\"change_technique\"|\"ready_to_close\"|\"missing_info\"|\"none\", \"suggestedMessage\": \"...\", \"context\": \"why in English (1 line)\"}

CONVERSATIONS:
$FETCH_OUTPUT" 2>/dev/null)

# Step 3: Validate we got JSON back
if ! echo "$PILLS" | node -e "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'))" 2>/dev/null; then
  echo "[$(date)] ERROR: Claude did not return valid JSON"
  echo "$PILLS" | head -20
  exit 1
fi

# Step 4: Store pills in DB
echo "$PILLS" | node backend/scripts/sales-coaching-local.js store

echo "[$(date)] Coaching run complete."
