#!/bin/bash
# Auto-download every image from app.envato.com/generation-history.
# Drives Chrome to scroll-to-bottom, scrapes every gen-assets URL, curls in parallel.
#
# Usage: ./envato_download_all.sh [output_dir]
#   Default output_dir: ~/Downloads/envato-designs
#
# Prerequisites:
#   - Open https://app.envato.com/generation-history in Google Chrome (logged in)
#   - macOS (uses osascript)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

OUT="${1:-$HOME/Downloads/envato-designs}"
mkdir -p "$OUT"

GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; RED=$'\033[0;31m'; NC=$'\033[0m'

echo "${GREEN}Driving Chrome to scroll & scrape generation-history...${NC}"

URLS=$(osascript "${SCRIPT_DIR}/envato_scrape.applescript" "${SCRIPT_DIR}/envato_scrape.js")

if [[ "$URLS" == ERR:* ]] || [[ -z "$URLS" ]]; then
  echo "${RED}${URLS:-No URLs returned}${NC}"
  exit 1
fi

COUNT=$(echo "$URLS" | wc -l | tr -d ' ')
echo "${GREEN}Scraped ${COUNT} unique URLs${NC}"
echo "${GREEN}Downloading to: ${YELLOW}${OUT}${NC}"

i=0
pids=()
while IFS= read -r url; do
  [[ -z "$url" ]] && continue
  i=$((i+1))
  padded=$(printf "%04d" $i)
  ids=$(echo "$url" | sed -E 's#.*/generated-assets/([^/]+)/([^?]+).*#\1_\2#')
  filename="${padded}_${ids}.jpg"
  curl -sL --max-time 30 -o "${OUT}/${filename}" "$url" &
  pids+=($!)
  if [ ${#pids[@]} -ge 10 ]; then
    wait "${pids[0]}" 2>/dev/null || true
    pids=("${pids[@]:1}")
  fi
done <<< "$URLS"

for pid in "${pids[@]}"; do wait "$pid" 2>/dev/null || true; done

total=0; failed=0
shopt -s nullglob
for f in "${OUT}"/*.jpg; do
  size=$(stat -f%z "$f" 2>/dev/null || echo 0)
  if [ "$size" -lt 5000 ]; then
    failed=$((failed+1))
    rm -f "$f"
  else
    total=$((total+1))
  fi
done

echo ""
echo "${GREEN}${total} images downloaded${NC}"
[ $failed -gt 0 ] && echo "${YELLOW}${failed} skipped (too small)${NC}"
echo "${GREEN}${OUT}${NC}"
