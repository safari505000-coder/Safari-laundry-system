# `modules/shared/` — V20.6 Shared

> Updated by V20.6 — Phase 6A.

Cross-cutting primitives that are too generic to belong in any single domain module: navigation config, auth matrix, low-level layout shells, and one-off reactors.

## Rule of thumb

If a helper is **financial**, it does NOT belong here. Push it into `modules/finance` (or the appropriate domain module) and re-export it through that module's `index.ts`.
