#!/bin/bash
# Install git hooks from scripts/hooks/ into .git/hooks/
# Run this once after cloning, or it will be called automatically by post-merge.

set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_SRC="$REPO_ROOT/scripts/hooks"
HOOKS_DST="$REPO_ROOT/.git/hooks"

if [ ! -d "$HOOKS_SRC" ]; then
  echo "ℹ️  No hooks directory found at scripts/hooks/, skipping."
  exit 0
fi

for hook in "$HOOKS_SRC"/*; do
  name="$(basename "$hook")"
  dst="$HOOKS_DST/$name"
  cp "$hook" "$dst"
  chmod +x "$dst"
  echo "✅ Installed hook: $name"
done

echo "🪝  Git hooks installed successfully."
