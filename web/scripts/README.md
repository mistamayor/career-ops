# Scripts

Operational scripts for the web layer. Run from inside `web/`.

## `pb:setup` — PocketBase schema migration

```bash
npm run pb:setup
```

Reconciles the PocketBase instance at `NEXT_PUBLIC_POCKETBASE_URL` against the spec in [`pb-schema.ts`](./pb-schema.ts). Additive-only and idempotent: each run either creates missing collections, appends missing fields or indexes to existing ones, or skips collections that already match. Never drops or mutates anything.

### When to run

- First-time bootstrap of a fresh PocketBase instance (dev or VPS).
- After editing [`pb-schema.ts`](./pb-schema.ts) to add a new collection, field, or index.
- After resetting a dev PocketBase volume.

Safe to run any time — if nothing has changed, every collection reports `SKIP` and the database is untouched.

### Required env vars

Read from `web/.env.local` (copy `web/.env.example` first). Exits with a clear error if any are missing or blank.

| Var | Purpose |
| --- | --- |
| `NEXT_PUBLIC_POCKETBASE_URL` | PocketBase base URL (e.g. `http://itfac3-us:8094`) |
| `POCKETBASE_ADMIN_EMAIL` | Superuser email |
| `POCKETBASE_ADMIN_PASSWORD` | Superuser password |

### Output

Each reconciled collection logs one of:

- `CREATE collection X (N fields, M indexes)` — new collection created.
- `UPDATE collection X: added field Y` — field appended to an existing collection.
- `UPDATE collection X: added index ...` — index appended.
- `SKIP collection X (up to date)` — nothing to do.

Followed by a summary table of `collection | action | fields_added | indexes_added`.

### Adding a new collection or field

1. Edit [`pb-schema.ts`](./pb-schema.ts).
   - For a new collection, append a `CollectionSpec` to the `collections` array. Put it **after** any collections it depends on (relations resolve in-order).
   - For a new field, add a `FieldSpec` to the relevant collection's `fields` array.
   - For a new index, add a SQL string to the collection's `indexes` array.
2. Run `npm run pb:setup`.
3. Commit the spec change.

### Non-goals for v1

These are intentionally not supported by this script:

- Removing fields, changing a field's type, or narrowing its constraints. Do those via the PocketBase admin UI or a purpose-built migration, and update the spec afterwards.
- Setting per-collection access rules. All rules default to null (admin-only). The web app talks to PocketBase via superuser SDK on the server side; per PLAN.md §2 decision #8, the browser never connects directly.
- Renames. Add a new field, migrate, deprecate the old one separately.
