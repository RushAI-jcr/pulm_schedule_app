#!/usr/bin/env bash
set -euo pipefail

./node_modules/.bin/tsc -p convex -noEmit --pretty false
./node_modules/.bin/tsc -p . -noEmit --pretty false
npm run test:authz >/dev/null
npm run build >/dev/null

echo "Smoke checks passed: typecheck + authz + build"
echo "Issue drafts: $(ls .github/ISSUES | wc -l | tr -d ' ')"
