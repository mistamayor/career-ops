/**
 * PocketBase schema spec — single source of truth for collections.
 *
 * Editing rules:
 * - Adding a field: safe. The setup script will append it on the next run.
 * - Removing a field: NOT handled by the setup script (additive-only in v1).
 *   Drop fields via the PocketBase admin UI or a hand-written migration.
 * - Renaming a field: don't. Add a new field, migrate data, deprecate the old one
 *   in a follow-up release.
 * - Adding an index: safe. Missing indexes are added on next run.
 * - Changing field constraints on an existing field: NOT handled by v1. Add a new
 *   field with the new shape or edit via admin UI.
 *
 * Source truth for the shape of these collections lives in
 * docs/project-plan/PLAN.md §4 (Data Model).
 */

// ---------------------------------------------------------------------------
// Field spec — discriminated union, one variant per PocketBase field type.
// ---------------------------------------------------------------------------

export type TextField = {
  type: "text";
  name: string;
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: string;
};

export type NumberField = {
  type: "number";
  name: string;
  required?: boolean;
  min?: number;
  max?: number;
  onlyInt?: boolean;
};

export type BoolField = { type: "bool"; name: string; required?: boolean };
export type UrlField = { type: "url"; name: string; required?: boolean };
export type DateField = { type: "date"; name: string; required?: boolean };
export type JsonField = { type: "json"; name: string; required?: boolean };

export type SelectField = {
  type: "select";
  name: string;
  required?: boolean;
  values: readonly string[];
  /** PocketBase treats `maxSelect: 1` as single-select, >1 as multi-select. */
  maxSelect: number;
};

export type RelationField = {
  type: "relation";
  name: string;
  required?: boolean;
  /** Name of the target collection, resolved to a collectionId at runtime. */
  targetCollection: string;
  maxSelect: number;
  cascadeDelete: boolean;
};

export type FileField = {
  type: "file";
  name: string;
  required?: boolean;
  maxSelect: number;
  /** Bytes. */
  maxSize: number;
  mimeTypes: readonly string[];
};

export type FieldSpec =
  | TextField
  | NumberField
  | BoolField
  | UrlField
  | DateField
  | JsonField
  | SelectField
  | RelationField
  | FileField;

export interface CollectionSpec {
  name: string;
  type: "base";
  fields: FieldSpec[];
  /** Raw SQL index DDL — compared verbatim with existing indexes. */
  indexes?: string[];
}

// ---------------------------------------------------------------------------
// Collections, in dependency order: parents before children.
// cv_templates → cv_versions → applications → events, jobs
// ---------------------------------------------------------------------------

export const collections: CollectionSpec[] = [
  // CV templates — visual templates the PDF renderer uses.
  // Must exist before cv_versions because cv_versions.template references it.
  {
    name: "cv_templates",
    type: "base",
    fields: [
      { type: "text", name: "name", required: true },
      { type: "text", name: "slug", required: true },
      { type: "text", name: "html_template", required: true },
      { type: "text", name: "css", required: true },
      {
        type: "file",
        name: "preview_image",
        maxSelect: 1,
        maxSize: 2_097_152, // 2 MB
        mimeTypes: ["image/png", "image/jpeg", "image/webp"],
      },
      { type: "bool", name: "is_default" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_cv_templates_slug ON cv_templates (slug)",
    ],
  },

  // CV versions — every tailored CV variant, plus the base.
  // Self-relation: `parent` points back to cv_versions. The setup script
  // handles this chicken-and-egg by creating the collection first, then
  // patching `parent` in with the newly-known collection id.
  {
    name: "cv_versions",
    type: "base",
    fields: [
      { type: "text", name: "label", required: true },
      {
        type: "select",
        name: "source",
        required: true,
        values: ["base", "tailored", "manual_edit"],
        maxSelect: 1,
      },
      {
        type: "relation",
        name: "parent",
        targetCollection: "cv_versions",
        maxSelect: 1,
        cascadeDelete: false,
      },
      { type: "text", name: "markdown", required: true },
      {
        type: "file",
        name: "pdf",
        maxSelect: 1,
        maxSize: 10_485_760, // 10 MB
        mimeTypes: ["application/pdf"],
      },
      {
        type: "relation",
        name: "template",
        targetCollection: "cv_templates",
        maxSelect: 1,
        cascadeDelete: false,
      },
      { type: "text", name: "target_archetype" },
    ],
  },

  // Applications — a row per job we evaluate or apply to. Core of the Kanban.
  {
    name: "applications",
    type: "base",
    fields: [
      { type: "text", name: "company", required: true },
      { type: "text", name: "role", required: true },
      { type: "url", name: "jd_url" },
      // No max length — long-form JD paste can be many KB.
      { type: "text", name: "jd_text" },
      {
        type: "select",
        name: "jd_source",
        values: ["manual", "career-ops-scan", "paste"],
        maxSelect: 1,
      },
      { type: "number", name: "fit_score", min: 0, max: 5 },
      {
        type: "select",
        name: "status",
        required: true,
        values: [
          "discovered",
          "evaluated",
          "applied",
          "interview",
          "offer",
          "rejected",
          "withdrawn",
        ],
        maxSelect: 1,
      },
      {
        type: "relation",
        name: "cv_version",
        targetCollection: "cv_versions",
        maxSelect: 1,
        cascadeDelete: false,
      },
      { type: "text", name: "archetype" },
      { type: "text", name: "comp_range" },
      { type: "text", name: "location" },
      { type: "date", name: "applied_at" },
      { type: "text", name: "evaluation_report_md" },
      { type: "text", name: "evaluation_report_path" },
      { type: "text", name: "notes" },
      { type: "bool", name: "pinned" },
    ],
    indexes: [
      "CREATE INDEX idx_applications_status ON applications (status)",
      "CREATE INDEX idx_applications_company ON applications (company)",
      "CREATE INDEX idx_applications_pinned ON applications (pinned)",
    ],
  },

  // Events — append-only timeline for each application. Cascades on delete so
  // removing an application cleans its history too.
  {
    name: "events",
    type: "base",
    fields: [
      {
        type: "relation",
        name: "application",
        required: true,
        targetCollection: "applications",
        maxSelect: 1,
        cascadeDelete: true,
      },
      {
        type: "select",
        name: "type",
        required: true,
        values: [
          "created",
          "evaluated",
          "applied",
          "interview_scheduled",
          "interview_done",
          "rejected",
          "offer_received",
          "offer_accepted",
          "offer_declined",
          "withdrawn",
          "note_added",
          "status_changed",
        ],
        maxSelect: 1,
      },
      { type: "date", name: "occurred_at", required: true },
      { type: "json", name: "payload" },
    ],
    indexes: [
      "CREATE INDEX idx_events_application ON events (application)",
      "CREATE INDEX idx_events_occurred_at ON events (occurred_at)",
    ],
  },

  // Jobs — async work queue for evaluate_jd / generate_pdf / rescan / regen.
  // Does NOT cascade-delete on application removal: job history is useful
  // independent of whether the application still exists.
  {
    name: "jobs",
    type: "base",
    fields: [
      {
        type: "select",
        name: "type",
        required: true,
        values: [
          "evaluate_jd",
          "generate_pdf",
          "rescan_tracker",
          "regenerate_cv",
        ],
        maxSelect: 1,
      },
      {
        type: "select",
        name: "status",
        required: true,
        values: ["queued", "running", "done", "failed", "cancelled"],
        maxSelect: 1,
      },
      { type: "json", name: "input" },
      { type: "json", name: "output" },
      // Unbounded text — stdout/stderr can grow during long evaluations.
      { type: "text", name: "log" },
      { type: "text", name: "error" },
      { type: "date", name: "started_at" },
      { type: "date", name: "finished_at" },
      {
        type: "relation",
        name: "application",
        targetCollection: "applications",
        maxSelect: 1,
        cascadeDelete: false,
      },
    ],
    indexes: [
      "CREATE INDEX idx_jobs_status ON jobs (status)",
      "CREATE INDEX idx_jobs_type ON jobs (type)",
    ],
  },
];
