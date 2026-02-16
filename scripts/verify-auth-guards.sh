#!/usr/bin/env bash
set -euo pipefail

check() {
  local file=$1
  local pattern=$2
  local label=$3
  if ! rg -q "$pattern" "$file"; then
    echo "Missing auth guard: $label ($file)"
    exit 1
  fi
}

# Physician functions
check convex/functions/physicians.ts "await getCurrentPhysician\(ctx\)" "physician query guard"
check convex/functions/physicians.ts "await requireAdmin\(ctx\)" "physician admin guard"
check convex/functions/physicians.ts "linkCurrentUserToPhysicianByEmail" "link mutation present"

# Fiscal year functions
check convex/functions/fiscalYears.ts "await getCurrentPhysician\(ctx\)" "fiscal year query guard"
check convex/functions/fiscalYears.ts "await requireAdmin\(ctx\)" "fiscal year admin guard"

echo "Auth guard checks passed"
