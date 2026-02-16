# GitHub Issue Publishing

Local issue drafts are generated under `.github/ISSUES/`.

## Publish when authenticated

1. Re-authenticate GitHub CLI:
   - `gh auth login -h github.com`
2. Run bulk publisher:
   - `.github/scripts/create_issues_from_drafts.sh`

## Notes

- Draft count should match story count in backlog docs.
- Generated issues use the `story` label by default.
