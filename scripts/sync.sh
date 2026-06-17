#!/bin/bash
# ──────────────────────────────────────────────────────────────
# Mothership — Git Sync Script
# 
# Usage:
#   ./scripts/sync.sh          # auto-commit all changes with summary
#   ./scripts/sync.sh "msg"    # commit with custom message
#   ./scripts/sync.sh --pull   # pull latest first, then push
#   ./scripts/sync.sh --force  # force push (use carefully!)
# ──────────────────────────────────────────────────────────────

set -e

BRANCH=$(git branch --show-current)
MSG="${1:-auto-sync: $(date '+%Y-%m-%d %H:%M')}"

echo "→ Branch: $BRANCH"
echo "→ Message: $MSG"

# Pull first if requested
if [ "$1" = "--pull" ]; then
  echo "→ Pulling latest..."
  git pull origin "$BRANCH" --rebase
  MSG="${2:-auto-sync: $(date '+%Y-%m-%d %H:%M')}"
fi

# Check for changes
if [ -z "$(git status --porcelain)" ]; then
  echo "✓ No changes to commit."
  exit 0
fi

# Stage everything
git add -A

# Show what's being committed
echo ""
echo "→ Changes:"
git status --short
echo ""

# Commit
git commit -m "$MSG"

# Push
if [ "$1" = "--force" ]; then
  echo "→ Force pushing..."
  git push origin "$BRANCH" --force
else
  echo "→ Pushing..."
  git push origin "$BRANCH"
fi

echo "✓ Done — pushed to origin/$BRANCH"
