#!/bin/bash
# Nightly sales learning — invoked by launchd once per day
# Claude Code analyzes patterns + lost deals, stores insights in DB

set -e

PROJECT_DIR="/Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/axkan_brain_system"
cd "$PROJECT_DIR"

export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.claude/bin:$HOME/.npm-global/bin:$PATH"

if ! command -v claude &>/dev/null; then
  echo "[$(date)] ERROR: claude CLI not found"
  exit 1
fi

echo "[$(date)] Starting nightly sales learning..."

# === Part 1: Pattern Analysis ===
echo "[$(date)] Fetching pattern data..."
PATTERN_DATA=$(node backend/scripts/nightly-learning-local.js fetch-patterns 2>&1)

if echo "$PATTERN_DATA" | grep -q "NOT_ENOUGH_DATA"; then
  echo "[$(date)] Not enough data for pattern analysis."
else
  echo "[$(date)] Running pattern analysis..."
  PATTERN_INSIGHTS=$(claude -p --dangerously-skip-permissions "Analyze these WhatsApp sales stats for AXKAN (custom souvenirs, MDF laser-cut, Mexico).

Generate 2-4 NEW, actionable pattern insights. For each:
- auto_adjustable = true for: tone, message length, timing, opening style, emoji usage
- auto_adjustable = false for: prices, minimum quantities, delivery times, policies

OUTPUT: raw JSON array only (no markdown, no backticks).
Each element: {\"type\": \"pattern_insight\", \"category\": \"tone|timing|opening|follow_up\", \"insight\": \"insight in Spanish, max 1 line\", \"evidence\": \"specific data point\", \"auto_adjustable\": true/false, \"confidence\": \"high|medium|low\"}

DATA:
$PATTERN_DATA" 2>/dev/null)

  if echo "$PATTERN_INSIGHTS" | node -e "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'))" 2>/dev/null; then
    echo "$PATTERN_INSIGHTS" | node backend/scripts/nightly-learning-local.js store
    echo "[$(date)] Pattern insights stored."
  else
    echo "[$(date)] ERROR: Pattern analysis returned invalid JSON"
  fi
fi

# === Part 2: Lost Deals ===
echo "[$(date)] Fetching lost deals..."
LOST_DATA=$(node backend/scripts/nightly-learning-local.js fetch-lost 2>&1)

if echo "$LOST_DATA" | grep -q "NO_LOST_DEALS"; then
  echo "[$(date)] No lost deals to analyze."
else
  echo "[$(date)] Analyzing lost deals..."
  LOST_INSIGHTS=$(claude -p --dangerously-skip-permissions "These WhatsApp conversations for AXKAN souvenirs showed buying intent but NEVER resulted in a sale. Analyze what the bot did WRONG in each.

Common bot mistakes:
- Sending generic images instead of quoting
- Repeating questions the client already answered
- Not generating a quote when client gave product + quantity
- Too many questions instead of closing
- Messages too long or formal
- Not creating urgency
- Ignoring buying signals

For each conversation, generate 2-4 SPECIFIC mistakes (not generic).

OUTPUT: raw JSON array only (no markdown, no backticks).
Each element: {\"type\": \"lost_deal\", \"category\": \"tone|timing|closing|follow_up|objection|repetition|product_knowledge\", \"insight\": \"RULE: what bot should do (1 line, Spanish)\", \"evidence\": \"exact message where it failed\", \"auto_adjustable\": true, \"confidence\": \"high\", \"sourceConversationId\": <id from data>}

CONVERSATIONS:
$LOST_DATA" 2>/dev/null)

  if echo "$LOST_INSIGHTS" | node -e "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'))" 2>/dev/null; then
    echo "$LOST_INSIGHTS" | node backend/scripts/nightly-learning-local.js store
    echo "[$(date)] Lost deal insights stored."
  else
    echo "[$(date)] ERROR: Lost deals analysis returned invalid JSON"
  fi
fi

echo "[$(date)] Nightly learning complete."
