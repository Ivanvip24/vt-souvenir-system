#!/bin/bash
# =============================================================
# AXKAN Pre-Commit Guard
# Runs automatically before every commit. Blocks bad patterns.
# =============================================================

ERRORS=0

# --- Check 1: No secrets in code ---
# Look for things that smell like API keys or tokens
SECRET_PATTERN='sk-[a-zA-Z0-9]\{20,\}\|secret_[a-zA-Z0-9]\{20,\}\|AKIA[A-Z0-9]\{16\}'
if git diff --cached --diff-filter=ACM -- '*.js' '*.py' '*.ts' '*.jsx' '*.tsx' '*.json' '*.yaml' '*.yml' '*.sh' | grep -i "$SECRET_PATTERN" | grep -v '.env.example' | grep -v '.gitignore'; then
  echo "BLOCKED: Possible API key or secret detected in staged files."
  echo "  Move it to .env and reference via process.env"
  ERRORS=$((ERRORS + 1))
fi

# --- Check 2: No unpinned dependencies ---
# Check if any package.json has ^ or ~ in dependencies
for f in $(git diff --cached --name-only --diff-filter=ACM | grep 'package.json$'); do
  if grep -E '"[~^]' "$f" | grep -v '"node_modules' > /dev/null 2>&1; then
    echo "BLOCKED: Unpinned dependency found in $f"
    echo "  Remove ^ and ~ — use exact versions only (Playbook L2)"
    ERRORS=$((ERRORS + 1))
  fi
done

# --- Check 3: No console.log in backend services ---
# (Only checks newly added lines, not existing code)
if git diff --cached --diff-filter=ACM -- 'backend/services/*.js' 'backend/api/*.js' | grep '^\+' | grep -v '^\+\+\+' | grep 'console\.log' > /dev/null 2>&1; then
  echo "WARNING: console.log found in new code."
  echo "  Use log() from shared/logger.js instead (Playbook L11)"
  # Warning only, not blocking — until logger migration is complete
fi

# --- Check 4: No .env files committed ---
if git diff --cached --name-only | grep -E '^\.env$|/\.env$' > /dev/null 2>&1; then
  echo "BLOCKED: .env file staged for commit."
  echo "  Never commit .env — it contains secrets (Playbook L3)"
  ERRORS=$((ERRORS + 1))
fi

# --- Check 5: No bare fetch() without timeout in services ---
if git diff --cached --diff-filter=ACM -- 'backend/services/*.js' | grep '^\+' | grep -v '^\+\+\+' | grep -E 'fetch\(' | grep -v 'fetchWithTimeout' > /dev/null 2>&1; then
  echo "WARNING: bare fetch() found without timeout wrapper."
  echo "  Use fetchWithTimeout() from shared/fetch-with-timeout.js (Playbook S4)"
fi

# --- Result ---
if [ $ERRORS -gt 0 ]; then
  echo ""
  echo "Commit BLOCKED — fix the $ERRORS error(s) above."
  exit 1
fi

exit 0
