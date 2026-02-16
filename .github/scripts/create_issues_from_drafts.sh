#!/usr/bin/env bash
set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required"
  exit 1
fi

for f in .github/ISSUES/*.md; do
  title=$(head -n 1 "$f" | sed 's/^# //')
  body=$(tail -n +2 "$f")
  if gh issue create --title "$title" --body "$body" --label story; then
    echo "Created: $title"
  else
    echo "Failed: $title"
  fi
done
