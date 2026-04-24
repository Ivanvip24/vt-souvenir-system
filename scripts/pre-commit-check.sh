#!/bin/bash
# =============================================================
# AXKAN Pre-Commit Guard
# Runs automatically before every commit. Blocks bad patterns.
# =============================================================

ERRORS=0

# --- Check 1: No secrets in code ---
if git diff --cached --diff-filter=ACM -- '*.js' '*.py' '*.ts' '*.jsx' '*.tsx' '*.json' '*.yaml' '*.yml' '*.sh' 2>/dev/null | grep -iE '(sk-[a-zA-Z0-9]{20,}|secret_[a-zA-Z0-9]{20,}|AKIA[A-Z0-9]{16})' 2>/dev/null | grep -v '.env.example' | grep -v '.gitignore' > /dev/null 2>&1; then
  echo "BLOCKED: Possible API key or secret detected in staged files."
  echo "  Move it to .env and reference via process.env"
  ERRORS=$((ERRORS + 1))
fi

# --- Check 2: No unpinned dependencies ---
for f in $(git diff --cached --name-only --diff-filter=ACM 2>/dev/null | grep 'package.json$'); do
  if grep -F '"^' "$f" > /dev/null 2>&1 || grep -F '"~' "$f" > /dev/null 2>&1; then
    echo "BLOCKED: Unpinned dependency found in $f"
    echo "  Remove ^ and ~ — use exact versions only (Playbook L2)"
    ERRORS=$((ERRORS + 1))
  fi
done

# --- Check 3: No console.log in backend services ---
if git diff --cached --diff-filter=ACM -- 'backend/services/*.js' 'backend/api/*.js' 2>/dev/null | grep '^+' 2>/dev/null | grep -v '^+++' 2>/dev/null | grep -q 'console\.log' 2>/dev/null; then
  echo "WARNING: console.log found in new code ($CONSOLE_HITS occurrences)."
  echo "  Use log() from shared/logger.js instead (Playbook L11)"
fi

# --- Check 4: No .env files committed ---
if git diff --cached --name-only 2>/dev/null | grep -qE '^\.env$|/\.env$' 2>/dev/null; then
  echo "BLOCKED: .env file staged for commit."
  echo "  Never commit .env — it contains secrets (Playbook L3)"
  ERRORS=$((ERRORS + 1))
fi

# --- Check 5: No bare fetch() without timeout in services ---
if git diff --cached --diff-filter=ACM -- 'backend/services/*.js' 2>/dev/null | grep '^+' 2>/dev/null | grep -v '^+++' 2>/dev/null | grep 'fetch(' 2>/dev/null | grep -qv 'fetchWithTimeout' 2>/dev/null; then
  echo "WARNING: bare fetch() found without timeout wrapper ($BARE_FETCH occurrences)."
  echo "  Use fetchWithTimeout() from shared/fetch-with-timeout.js (Playbook S4)"
fi

# --- Result ---
if [ $ERRORS -gt 0 ]; then
  echo ""
  echo "Commit BLOCKED — fix the $ERRORS error(s) above."
  exit 1
fi

exit 0
