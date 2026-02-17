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
check convex/functions/physicians.ts "await requireAuthenticatedUser\(ctx\)|await getCurrentPhysician\(ctx\)" "physician query guard"
check convex/functions/physicians.ts "await requireAdmin\(ctx\)" "physician admin guard"
check convex/functions/physicians.ts "linkCurrentUserToPhysicianByEmail" "link mutation present"

# Fiscal year functions
check convex/functions/fiscalYears.ts "await requireAuthenticatedUser\(ctx\)|await getCurrentPhysician\(ctx\)" "fiscal year query guard"
check convex/functions/fiscalYears.ts "await requireAdmin\(ctx\)" "fiscal year admin guard"

# Schedule request functions
check convex/functions/scheduleRequests.ts "await getCurrentPhysician\(ctx\)" "schedule request user guard"
check convex/functions/scheduleRequests.ts "await requireAdmin\(ctx\)" "schedule request admin guard"

# Trade request functions
check convex/functions/tradeRequests.ts "await getCurrentPhysician\(ctx\)" "trade request user guard"
check convex/functions/tradeRequests.ts "await requireAdmin\(ctx\)" "trade request admin guard"

# Rotation functions
check convex/functions/rotations.ts "await requireAdmin\(ctx\)" "rotation admin guard"

# Clinic type functions
check convex/functions/clinicTypes.ts "await requireAdmin\(ctx\)" "clinic type admin guard"

# Rotation preference functions
check convex/functions/rotationPreferences.ts "await getCurrentPhysician\(ctx\)" "rotation preference user guard"
check convex/functions/rotationPreferences.ts "await requireAdmin\(ctx\)" "rotation preference admin guard"

# cFTE target functions
check convex/functions/cfteTargets.ts "await requireAdmin\(ctx\)" "cfte target admin guard"

# Physician clinic assignment functions
check convex/functions/physicianClinics.ts "await requireAdmin\(ctx\)" "physician clinic admin guard"

# Master calendar functions
check convex/functions/masterCalendar.ts "await requireAdmin\(ctx\)" "master calendar admin guard"

# Audit log functions
check convex/functions/auditLog.ts "await requireAdmin\(ctx\)" "audit log admin guard"

echo "Auth guard checks passed"
