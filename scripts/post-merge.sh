#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push

# Re-install git hooks (post-commit auto-push, etc.)
bash "$(git rev-parse --show-toplevel)/scripts/install-hooks.sh"
