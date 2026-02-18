#!/usr/bin/env bash
set -euo pipefail

npm run check >/dev/null

echo "Smoke checks passed: typecheck + authz + unit + build"
echo "Issue drafts: $(ls .github/ISSUES | wc -l | tr -d ' ')"
