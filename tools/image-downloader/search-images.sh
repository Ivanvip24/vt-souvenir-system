#!/bin/bash
# AXKAN Image Downloader
# Searches Bing Images and downloads results via curl
# Usage: ./search-images.sh "search query" [count] [output_dir]
#
# Examples:
#   ./search-images.sh "cancun mexico" 10
#   ./search-images.sh "imanes turisticos mexico" 30 ~/Downloads/imanes
#   ./search-images.sh "site:vtanunciando.com" 50 ./competitor-designs

set -euo pipefail

QUERY="${1:?Usage: $0 \"search query\" [count] [output_dir]}"
COUNT="${2:-10}"
OUTPUT_DIR="${3:-./downloads}"
TIMEOUT=10

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🔍 Searching Bing Images for: ${YELLOW}${QUERY}${NC}"
echo -e "${GREEN}📦 Downloading ${COUNT} images to: ${YELLOW}${OUTPUT_DIR}${NC}"

# Create output directory
mkdir -p "${OUTPUT_DIR}"

# URL-encode the query
ENCODED_QUERY=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${QUERY}'))")

# Fetch Bing Images page and extract image URLs using Python
URLS=$(python3 << PYEOF
import urllib.request
import json
import re
import ssl

# Bypass SSL verification for search
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

query = "${ENCODED_QUERY}"
url = f"https://www.bing.com/images/search?q={query}&first=1&count=100"

headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

req = urllib.request.Request(url, headers=headers)
response = urllib.request.urlopen(req, context=ctx)
html = response.read().decode("utf-8", errors="ignore")

# Extract image URLs from Bing's 'm' attribute JSON
pattern = r'"murl":"(https?://[^"]+)"'
matches = re.findall(pattern, html)

# Deduplicate while preserving order
seen = set()
unique = []
for m in matches:
    if m not in seen:
        seen.add(m)
        unique.append(m)

for u in unique[:${COUNT}]:
    print(u)
PYEOF
)

if [ -z "$URLS" ]; then
    echo -e "${RED}❌ No images found for query: ${QUERY}${NC}"
    exit 1
fi

# Count URLs found
FOUND=$(echo "$URLS" | wc -l | tr -d ' ')
echo -e "${GREEN}✅ Found ${FOUND} image URLs${NC}"

# Download images in parallel (max 10 concurrent)
i=0
pids=()
while IFS= read -r img_url; do
    i=$((i + 1))
    padded=$(printf "%02d" $i)

    # Determine extension from URL
    ext="jpg"
    case "$img_url" in
        *.png*) ext="png" ;;
        *.webp*) ext="webp" ;;
        *.gif*) ext="gif" ;;
        *.jpeg*) ext="jpeg" ;;
    esac

    filename="img_${padded}.${ext}"

    curl -sL --max-time ${TIMEOUT} -o "${OUTPUT_DIR}/${filename}" "${img_url}" &
    pids+=($!)

    # Limit concurrency to 10
    if [ ${#pids[@]} -ge 10 ]; then
        wait "${pids[0]}" 2>/dev/null || true
        pids=("${pids[@]:1}")
    fi
done <<< "$URLS"

# Wait for remaining downloads
for pid in "${pids[@]}"; do
    wait "$pid" 2>/dev/null || true
done

# Report results
echo ""
echo -e "${GREEN}📁 Download complete. Results:${NC}"
total=0
failed=0
for f in "${OUTPUT_DIR}"/img_*.{jpg,png,webp,gif,jpeg} 2>/dev/null; do
    [ -f "$f" ] || continue
    size=$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f" 2>/dev/null || echo 0)
    if [ "$size" -lt 1000 ]; then
        echo -e "  ${RED}✗ $(basename $f) — ${size}B (likely failed)${NC}"
        failed=$((failed + 1))
    else
        human_size=$(echo "$size" | awk '{ if ($1 >= 1048576) printf "%.1fMB", $1/1048576; else printf "%.0fKB", $1/1024 }')
        echo -e "  ${GREEN}✓ $(basename $f) — ${human_size}${NC}"
    fi
    total=$((total + 1))
done

good=$((total - failed))
echo ""
echo -e "${GREEN}📊 ${good}/${total} images downloaded successfully${NC}"
if [ $failed -gt 0 ]; then
    echo -e "${YELLOW}⚠️  ${failed} images failed (blocked by server or too small)${NC}"
fi
