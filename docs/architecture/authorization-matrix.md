# Authorization Matrix

This matrix defines server-side permission expectations for Convex functions.

## Roles

- `admin`: full scheduling administration
- `physician`: can manage only own scheduling data
- `unauthenticated`: no access to protected scheduling resources

## Access rules

| Resource / Action | Unauthenticated | Physician | Admin |
|---|---:|---:|---:|
| View own physician profile | deny | allow | allow |
| View all physicians | deny | allow | allow |
| Create/update physician records | deny | deny | allow |
| Link auth account to physician by email | deny | allow (self) | allow (self) |
| View fiscal years | deny | allow | allow |
| Create/update fiscal years | deny | deny | allow |
| View schedule request (own) | deny | allow (own) | allow |
| Submit/revise schedule request (own) | deny | allow (own) | allow |
| View all schedule requests | deny | deny | allow |
| Manage rotations/clinic config | deny | deny | allow |
| Build/publish master calendar | deny | deny | allow |
| Propose trade involving self | deny | allow (self) | allow |
| Resolve trade as admin | deny | deny | allow |
| Read audit log | deny | deny | allow |

## Enforcement notes

- Enforce authorization in backend Convex functions, never client-only checks.
- Apply object-level checks (`own` record validation) on every request.
- Return explicit authorization errors, without leaking sensitive record details.
- Add regression tests for cross-user access attempts (BOLA/IDOR style).
