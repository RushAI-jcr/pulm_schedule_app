# Authorization Matrix

This matrix defines server-side permission expectations for Convex functions.

## Roles

- `admin`: full scheduling administration
- `physician`: can manage only own scheduling data
- `viewer`: authenticated read-only access with no physician calendar workflows
- `unauthenticated`: no access to protected scheduling resources
- Role precedence: `admin` > `physician` > `viewer` (highest role always wins)
- Authenticated default: new users without explicit assignment resolve to `physician`
- Non-physician read-only users: set `users.role = "viewer"` in Convex to downgrade access

## Access rules

| Resource / Action | Unauthenticated | Viewer | Physician | Admin |
|---|---:|---:|---:|---:|
| View own physician profile | deny | deny | allow | allow |
| View all physicians | deny | allow | allow | allow |
| Create/update physician records | deny | deny | deny | allow |
| Link auth account to physician by email | deny | deny | allow (self) | allow (self) |
| View fiscal years | deny | allow | allow | allow |
| Create/update fiscal years | deny | deny | deny | allow |
| View schedule request (own) | deny | deny | allow (own) | allow (own, if linked) |
| Submit/revise schedule request (own) | deny | deny | allow (own) | allow (own, if linked) |
| View all schedule requests | deny | deny | deny | allow |
| Manage rotations/clinic config | deny | deny | deny | allow |
| Build/publish master calendar | deny | deny | deny | allow |
| Propose trade involving self | deny | deny | allow (self) | allow (self, if linked) |
| Resolve trade as admin | deny | deny | deny | allow |
| Read audit log | deny | deny | deny | allow |

## Enforcement notes

- Enforce authorization in backend Convex functions, never client-only checks.
- Apply object-level checks (`own` record validation) on every request.
- Return explicit authorization errors, without leaking sensitive record details.
- Add regression tests for cross-user access attempts (BOLA/IDOR style).
- Route guards follow the same hierarchy (`admin` > `physician` > `viewer`) for protected pages.
