# Authorization Test Cases

Target: catch broken object-level authorization and role bypass regressions.

## Physician self-scope tests

- Physician A cannot read Physician B private request details.
- Physician A cannot edit Physician B request/preferences.
- Physician A cannot resolve trades they do not own.

## Role escalation tests

- Non-admin cannot run admin mutations (seed, fiscal year create, publish schedule).
- Non-admin cannot access admin-only audit log endpoints.
- Hidden admin UI controls do not grant access without backend checks.

## Bootstrap and account-linking tests

- First authenticated user can run bootstrap seed only when physician table is empty.
- After bootstrap, seed operations require admin role.
- Email-based link rejects linking when physician record is already bound to another auth subject.

## Error response tests

- Unauthorized access returns authorization failure without leaking target object details.
- Not-found and forbidden are handled consistently for object-level endpoints.

## Regression checklist

- Add a positive and negative authorization case for each new public Convex function.
- Include at least one cross-user test per feature touching physician-owned records.
