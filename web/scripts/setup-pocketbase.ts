/**
 * PocketBase schema migration runner — idempotent, additive-only (v1).
 *
 * Reads the spec in `./pb-schema.ts` and reconciles it against the PocketBase
 * instance at NEXT_PUBLIC_POCKETBASE_URL. For each collection it either:
 *
 *   - CREATE: the collection doesn't exist; create with all spec fields/indexes.
 *   - UPDATE: the collection exists but is missing one or more spec fields or
 *     indexes; append them. Never drops or mutates anything.
 *   - SKIP:   already up to date.
 *
 * Run from `web/` via `npm run pb:setup`. Requires .env.local with the three
 * env vars listed below. Safe to re-run.
 */

import { config as loadEnv } from "dotenv";
import PocketBase, {
  ClientResponseError,
  type CollectionModel,
} from "pocketbase";

import {
  collections,
  type CollectionSpec,
  type FieldSpec,
} from "./pb-schema";

// Load env from web/.env.local. `process.cwd()` is web/ when invoked via
// `npm run pb:setup` because npm sets cwd to the package.json directory.
loadEnv({ path: ".env.local" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActionReport = {
  collection: string;
  action: "created" | "updated" | "skipped";
  fieldsAdded: number;
  indexesAdded: number;
};

// PocketBase's CollectionField is `{ [key: string]: any; ... }` in the SDK,
// and the union of accepted field shapes differs per `type`. A tighter local
// type would fight the API, so we build fields as plain records and let the
// server validate.
// SDK: any — see pocketbase/dist/pocketbase.es.d.ts line 63.
type PbFieldInput = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Env + misc helpers
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const v = process.env[name];
  if (v === undefined || v.trim() === "") {
    console.error(`✗ Missing required env: ${name}`);
    console.error(
      `  Set it in web/.env.local (copy from web/.env.example first).`,
    );
    process.exit(1);
  }
  return v;
}

function describeError(err: unknown): string {
  if (err instanceof ClientResponseError) {
    const data =
      err.data && Object.keys(err.data).length > 0
        ? `\n  ${JSON.stringify(err.data, null, 2).replace(/\n/g, "\n  ")}`
        : "";
    return `${err.status} ${err.message}${data}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

// ---------------------------------------------------------------------------
// FieldSpec → PocketBase field body
// ---------------------------------------------------------------------------

/**
 * Convert a human-friendly FieldSpec into the body shape PocketBase's API
 * expects under `collection.fields`.
 *
 * Returns `null` for a self-relation that cannot yet be resolved — the caller
 * handles this by creating the collection first, then running a follow-up
 * update once the collection's own id is known.
 */
function specToPbField(
  f: FieldSpec,
  collectionIds: ReadonlyMap<string, string>,
  currentCollection: string,
  currentCollectionId: string | null,
): PbFieldInput | null {
  const required = f.required ?? false;

  switch (f.type) {
    case "text": {
      const out: PbFieldInput = { name: f.name, type: "text", required };
      if (f.min !== undefined) out.min = f.min;
      if (f.max !== undefined) out.max = f.max;
      if (f.pattern !== undefined) out.pattern = f.pattern;
      return out;
    }
    case "number": {
      const out: PbFieldInput = { name: f.name, type: "number", required };
      if (f.min !== undefined) out.min = f.min;
      if (f.max !== undefined) out.max = f.max;
      if (f.onlyInt !== undefined) out.onlyInt = f.onlyInt;
      return out;
    }
    case "bool":
      return { name: f.name, type: "bool", required };
    case "url":
      return { name: f.name, type: "url", required };
    case "date":
      return { name: f.name, type: "date", required };
    case "json":
      return { name: f.name, type: "json", required };
    case "select":
      return {
        name: f.name,
        type: "select",
        required,
        values: [...f.values],
        maxSelect: f.maxSelect,
      };
    case "file":
      return {
        name: f.name,
        type: "file",
        required,
        maxSelect: f.maxSelect,
        maxSize: f.maxSize,
        mimeTypes: [...f.mimeTypes],
      };
    case "relation": {
      let collectionId: string | undefined;
      if (f.targetCollection === currentCollection) {
        if (currentCollectionId === null) return null; // defer self-relation
        collectionId = currentCollectionId;
      } else {
        collectionId = collectionIds.get(f.targetCollection);
        if (collectionId === undefined) {
          throw new Error(
            `Relation ${currentCollection}.${f.name} targets ` +
              `"${f.targetCollection}" but that collection has not been ` +
              `processed yet. Fix the ordering in pb-schema.ts.`,
          );
        }
      }
      return {
        name: f.name,
        type: "relation",
        required,
        collectionId,
        maxSelect: f.maxSelect,
        minSelect: 0,
        cascadeDelete: f.cascadeDelete,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Per-collection reconcile
// ---------------------------------------------------------------------------

async function tryGetCollection(
  pb: PocketBase,
  name: string,
): Promise<CollectionModel | null> {
  try {
    return await pb.collections.getOne(name);
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 404) return null;
    throw err;
  }
}

async function ensureCollection(
  pb: PocketBase,
  spec: CollectionSpec,
  collectionIds: Map<string, string>,
): Promise<ActionReport> {
  const existing = await tryGetCollection(pb, spec.name);

  // ----- CREATE -----
  if (existing === null) {
    const nowFields: PbFieldInput[] = [];
    const deferred: FieldSpec[] = [];

    for (const f of spec.fields) {
      const built = specToPbField(f, collectionIds, spec.name, null);
      if (built === null) deferred.push(f);
      else nowFields.push(built);
    }

    const created = await pb.collections.create({
      name: spec.name,
      type: spec.type,
      fields: nowFields,
      indexes: spec.indexes ?? [],
    });
    collectionIds.set(spec.name, created.id);

    console.log(
      `  CREATE collection ${spec.name} ` +
        `(${nowFields.length} fields, ${spec.indexes?.length ?? 0} indexes)`,
    );

    // Handle deferred self-relations: we now know our own id.
    if (deferred.length > 0) {
      const resolved = deferred.map((f) => {
        const built = specToPbField(f, collectionIds, spec.name, created.id);
        if (built === null) {
          throw new Error(
            `Internal: could not resolve deferred field ` +
              `${spec.name}.${f.name} after create`,
          );
        }
        return built;
      });

      const merged: PbFieldInput[] = [
        ...(created.fields as unknown as PbFieldInput[]),
        ...resolved,
      ];

      await pb.collections.update(created.id, { fields: merged });
      for (const f of deferred) {
        console.log(
          `  UPDATE collection ${spec.name}: added field ${f.name} (self-relation)`,
        );
      }
    }

    return {
      collection: spec.name,
      action: "created",
      fieldsAdded: spec.fields.length,
      indexesAdded: spec.indexes?.length ?? 0,
    };
  }

  // ----- UPDATE or SKIP -----
  collectionIds.set(spec.name, existing.id);

  const existingFieldNames = new Set(existing.fields.map((f) => f.name));
  const missingFields = spec.fields.filter(
    (f) => !existingFieldNames.has(f.name),
  );

  const existingIndexes = new Set(existing.indexes ?? []);
  const missingIndexes = (spec.indexes ?? []).filter(
    (idx) => !existingIndexes.has(idx),
  );

  if (missingFields.length === 0 && missingIndexes.length === 0) {
    console.log(`  SKIP   collection ${spec.name} (up to date)`);
    return {
      collection: spec.name,
      action: "skipped",
      fieldsAdded: 0,
      indexesAdded: 0,
    };
  }

  const newFieldInputs = missingFields.map((f) => {
    const built = specToPbField(f, collectionIds, spec.name, existing.id);
    if (built === null) {
      throw new Error(
        `Internal: could not resolve new field ${spec.name}.${f.name} on update`,
      );
    }
    return built;
  });

  // Preserve existing fields verbatim (their ids anchor PocketBase's identity;
  // dropping them would drop data).
  const mergedFields: PbFieldInput[] = [
    ...(existing.fields as unknown as PbFieldInput[]),
    ...newFieldInputs,
  ];
  const mergedIndexes: string[] = [
    ...(existing.indexes ?? []),
    ...missingIndexes,
  ];

  await pb.collections.update(existing.id, {
    fields: mergedFields,
    indexes: mergedIndexes,
  });

  for (const f of missingFields) {
    console.log(`  UPDATE collection ${spec.name}: added field ${f.name}`);
  }
  for (const idx of missingIndexes) {
    const snippet = idx.length > 80 ? idx.slice(0, 77) + "..." : idx;
    console.log(`  UPDATE collection ${spec.name}: added index ${snippet}`);
  }

  return {
    collection: spec.name,
    action: "updated",
    fieldsAdded: missingFields.length,
    indexesAdded: missingIndexes.length,
  };
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function printSummary(reports: ActionReport[]): void {
  const headers = ["collection", "action", "fields_added", "indexes_added"];
  const rows = reports.map((r) => [
    r.collection,
    r.action,
    String(r.fieldsAdded),
    String(r.indexesAdded),
  ]);
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length)),
  );
  const fmt = (row: string[]): string =>
    row.map((c, i) => c.padEnd(widths[i])).join(" | ");
  const divider = widths.map((w) => "-".repeat(w)).join("-+-");

  console.log("");
  console.log("Summary");
  console.log("  " + fmt(headers));
  console.log("  " + divider);
  for (const r of rows) console.log("  " + fmt(r));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const pbUrl = requireEnv("NEXT_PUBLIC_POCKETBASE_URL");
  const email = requireEnv("POCKETBASE_ADMIN_EMAIL");
  const password = requireEnv("POCKETBASE_ADMIN_PASSWORD");

  const pb = new PocketBase(pbUrl);
  console.log(`→ PocketBase: ${pbUrl}`);

  try {
    await pb.collection("_superusers").authWithPassword(email, password);
    console.log(`→ Authenticated as superuser: ${email}`);
  } catch (err) {
    console.error(`✗ Superuser authentication failed for ${email}`);
    console.error(`  ${describeError(err)}`);
    process.exit(1);
  }

  const collectionIds = new Map<string, string>();
  const reports: ActionReport[] = [];

  console.log("");
  console.log("Reconciling collections:");

  for (const spec of collections) {
    try {
      reports.push(await ensureCollection(pb, spec, collectionIds));
    } catch (err) {
      console.error(`\n✗ Failed on collection ${spec.name}:`);
      console.error(`  ${describeError(err)}`);
      process.exit(1);
    }
  }

  printSummary(reports);
}

main().catch((err: unknown) => {
  console.error("Unexpected error:", describeError(err));
  process.exit(1);
});
