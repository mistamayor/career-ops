/**
 * Idempotent seed for the Phase 0 acceptance dataset.
 *
 * Populates cv_templates, cv_versions, applications, and a realistic events
 * timeline so the Kanban and detail pages have something non-empty to render.
 *
 * Idempotency strategy:
 * - cv_templates: natural key = `slug`
 * - cv_versions:  natural key = `label`
 * - applications: natural key = (`company`, `role`)
 * - events: skipped wholesale for an application if any events already exist
 *           for it (per the user's explicit guidance — we don't want to try
 *           to diff a timeline)
 *
 * For templates/versions/applications, each record is compared field-by-field
 * against the spec. If everything matches, log SKIP. If any seed-controlled
 * field differs, UPDATE. If the record doesn't exist, CREATE.
 *
 * Safe to re-run. Running twice should produce zero duplicates and an
 * all-SKIP log on the second pass.
 */

import { config as loadEnv } from "dotenv";
import PocketBase, { ClientResponseError } from "pocketbase";

import {
  Collections,
  CvVersionsSourceOptions,
  EventsTypeOptions,
  ApplicationsStatusOptions,
  type ApplicationsResponse,
  type CvTemplatesResponse,
  type CvVersionsResponse,
  type TypedPocketBase,
} from "../src/lib/pb-types";

// Load .env.local from cwd (=web/ when invoked via npm run pb:seed).
loadEnv({ path: ".env.local" });

// ---------------------------------------------------------------------------
// Seed data — edit here, never in the database.
// ---------------------------------------------------------------------------

type TemplateSeed = {
  slug: string;
  name: string;
  html_template: string;
  css: string;
  is_default: boolean;
};

type CvVersionSeed = {
  label: string;
  source: CvVersionsSourceOptions;
  parentLabel: string | null;
  markdown: string;
  templateSlug: string;
  target_archetype: string;
};

type ApplicationSeed = {
  company: string;
  role: string;
  status: ApplicationsStatusOptions;
  fit_score: number;
  archetype: string;
  location: string;
  comp_range: string;
  jd_source: "manual" | "career-ops-scan" | "paste";
  jd_text: string;
  notes: string;
  cv_version_label: string | null;
  pinned: boolean;
  applied_days_ago: number | null;
};

type EventSeed = {
  type: EventsTypeOptions;
  days_ago: number;
};

const CV_TEMPLATES: TemplateSeed[] = [
  {
    slug: "mayor-classic",
    name: "Mayor Classic",
    html_template: "<!-- placeholder - rendered in Phase 2 -->",
    css: "/* placeholder */",
    is_default: true,
  },
];

const CV_VERSIONS: CvVersionSeed[] = [
  {
    label: "Base CV — Mayor",
    source: CvVersionsSourceOptions.base,
    parentLabel: null,
    markdown:
      "# Olu Adeogun\n\nPlaceholder base CV — replaced in Phase 1 sync.",
    templateSlug: "mayor-classic",
    target_archetype: "",
  },
  {
    label: "Tailored — Anthropic MTS Applied AI",
    source: CvVersionsSourceOptions.tailored,
    parentLabel: "Base CV — Mayor",
    markdown: "# Olu Adeogun\n\nTailored placeholder for Anthropic.",
    templateSlug: "mayor-classic",
    target_archetype: "AI/ML Engineer",
  },
];

const APPLICATIONS: ApplicationSeed[] = [
  {
    company: "Anthropic",
    role: "Member of Technical Staff, Applied AI",
    status: ApplicationsStatusOptions.evaluated,
    fit_score: 4.6,
    archetype: "AI/ML Engineer",
    location: "Remote (UK)",
    comp_range: "$250k-$380k",
    jd_source: "manual",
    jd_text:
      "Work directly with customers to design and deploy production Claude " +
      "applications. The Applied AI team sits between research and product, " +
      "bridging capability demos and real-world deployments. You will prototype " +
      "workflows, evaluate model behaviour under realistic loads, and write " +
      "tools that let enterprise teams ship with Claude safely. Ideal for " +
      "engineers who enjoy customer-facing depth, strong written communication, " +
      "and comfort with ambiguity in fast-moving domains.",
    notes:
      "Top target. Strategy-of-applied-AI fit. Tailored CV emphasises " +
      "customer deployments and evaluation rigour.",
    cv_version_label: "Tailored — Anthropic MTS Applied AI",
    pinned: true,
    applied_days_ago: null,
  },
  {
    company: "Cohere",
    role: "Head of Implementation Services",
    status: ApplicationsStatusOptions.interview,
    fit_score: 4.3,
    archetype: "Solutions Architect",
    location: "London / Hybrid",
    comp_range: "£180k-£220k",
    jd_source: "manual",
    jd_text:
      "Lead the EMEA team responsible for delivering Cohere's enterprise " +
      "deployments end-to-end — from solution design through integration and " +
      "ongoing tuning. You will own customer outcomes for flagship accounts, " +
      "manage a growing team of solutions architects, and partner with Product " +
      "to surface productisation opportunities from field work. Heavy cross-" +
      "functional collaboration; comfort in both technical deep-dives and " +
      "executive conversations is non-negotiable.",
    notes:
      "Interview loop scheduled. Leadership angle resonates; revisit CV " +
      "narrative for team-scaling evidence.",
    cv_version_label: "Base CV — Mayor",
    pinned: false,
    applied_days_ago: null,
  },
  {
    company: "Scale AI",
    role: "Senior Solutions Architect",
    status: ApplicationsStatusOptions.applied,
    fit_score: 4.1,
    archetype: "Solutions Architect",
    location: "Remote",
    comp_range: "$200k-$280k",
    jd_source: "manual",
    jd_text:
      "Partner with Scale's largest AI customers to architect data-centric " +
      "workflows across annotation, model training, and evaluation pipelines. " +
      "You will scope multi-quarter engagements, translate messy customer " +
      "requirements into concrete deliverables, and work with internal " +
      "engineering to unblock integrations. Requires fluency across the " +
      "modern ML lifecycle and a track record of shipping with Fortune 500 " +
      "stakeholders under tight timelines.",
    notes: "Applied — awaiting screen. Warm intro via ex-colleague available if needed.",
    cv_version_label: "Base CV — Mayor",
    pinned: false,
    applied_days_ago: 14,
  },
  {
    company: "Retool",
    role: "AI Platform Lead",
    status: ApplicationsStatusOptions.discovered,
    fit_score: 3.8,
    archetype: "Product Engineering",
    location: "Remote",
    comp_range: "TBC",
    jd_source: "manual",
    jd_text:
      "Shape the roadmap for Retool's AI platform — the primitives customers " +
      "use to ship LLM-powered internal tools. You will collaborate with " +
      "Product, Design, and customer-facing teams to turn recurring build " +
      "patterns into first-class features, and lead a small engineering pod " +
      "on the underlying runtime. Best fit for a senior IC who has built " +
      "abstractions on top of model APIs and cares about developer experience.",
    notes:
      "Discovered via job board. Team size unclear, comp undisclosed — " +
      "probably worth a screening chat before investing in tailoring.",
    cv_version_label: null,
    pinned: false,
    applied_days_ago: null,
  },
  {
    company: "ElevenLabs",
    role: "Head of Applied AI",
    status: ApplicationsStatusOptions.offer,
    fit_score: 4.8,
    archetype: "AI Leadership",
    location: "London / Hybrid",
    comp_range: "£250k+ equity",
    jd_source: "manual",
    jd_text:
      "Build and lead a new Applied AI function at ElevenLabs. You will be " +
      "the technical counterpart to the GTM and Product leads for enterprise " +
      "voice AI, shaping how large customers integrate our models into live " +
      "production workflows. Heavy emphasis on founding-team instincts — " +
      "comfort hiring, owning end-to-end delivery, and making judgement calls " +
      "in the absence of process. Deep voice/audio background a plus but not " +
      "required; what matters is applied-AI seniority and customer taste.",
    notes:
      "Offer in hand. Negotiating on equity + remote flexibility. Decision " +
      "deadline approaching; pin for daily visibility.",
    cv_version_label: "Base CV — Mayor",
    pinned: true,
    applied_days_ago: 28,
  },
];

/** Keyed by `${company}|${role}`. */
const EVENTS_BY_APPLICATION: Record<string, EventSeed[]> = {
  "Anthropic|Member of Technical Staff, Applied AI": [
    { type: EventsTypeOptions.created, days_ago: 7 },
    { type: EventsTypeOptions.evaluated, days_ago: 6 },
  ],
  "Cohere|Head of Implementation Services": [
    { type: EventsTypeOptions.created, days_ago: 21 },
    { type: EventsTypeOptions.evaluated, days_ago: 20 },
    { type: EventsTypeOptions.applied, days_ago: 15 },
    { type: EventsTypeOptions.interview_scheduled, days_ago: 5 },
  ],
  "Scale AI|Senior Solutions Architect": [
    { type: EventsTypeOptions.created, days_ago: 18 },
    { type: EventsTypeOptions.evaluated, days_ago: 17 },
    { type: EventsTypeOptions.applied, days_ago: 14 },
  ],
  "Retool|AI Platform Lead": [
    { type: EventsTypeOptions.created, days_ago: 3 },
  ],
  "ElevenLabs|Head of Applied AI": [
    { type: EventsTypeOptions.created, days_ago: 35 },
    { type: EventsTypeOptions.evaluated, days_ago: 34 },
    { type: EventsTypeOptions.applied, days_ago: 28 },
    { type: EventsTypeOptions.interview_scheduled, days_ago: 20 },
    { type: EventsTypeOptions.interview_done, days_ago: 10 },
    { type: EventsTypeOptions.offer_received, days_ago: 3 },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const v = process.env[name];
  if (v === undefined || v.trim() === "") {
    console.error(`✗ Missing required env: ${name}`);
    console.error(`  Set it in web/.env.local`);
    process.exit(1);
  }
  return v;
}

function daysAgoIso(days: number): string {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return new Date(Date.now() - days * MS_PER_DAY).toISOString();
}

async function findOne<T>(
  pb: TypedPocketBase,
  collection: Parameters<TypedPocketBase["collection"]>[0],
  filter: string,
): Promise<T | null> {
  try {
    // SDK: any — generic override on getFirstListItem is how the SDK ships
    // narrow typing per call-site; CollectionService already returns the
    // right union so this is just reshaping.
    return (await pb
      .collection(collection)
      .getFirstListItem(filter)) as unknown as T;
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 404) return null;
    throw err;
  }
}

/**
 * Compare the spec's keys against an existing record. Returns the list of
 * field names that differ — empty means the record is already up to date.
 */
function diffFields(
  existing: Record<string, unknown>,
  spec: Record<string, unknown>,
): string[] {
  const changed: string[] = [];
  for (const key of Object.keys(spec)) {
    if (existing[key] !== spec[key]) changed.push(key);
  }
  return changed;
}

type UpsertResult = "created" | "updated" | "skipped";

// ---------------------------------------------------------------------------
// Per-collection upserts
// ---------------------------------------------------------------------------

async function upsertCvTemplate(
  pb: TypedPocketBase,
  spec: TemplateSeed,
): Promise<{ id: string; action: UpsertResult }> {
  const existing = await findOne<CvTemplatesResponse>(
    pb,
    Collections.CvTemplates,
    pb.filter("slug = {:slug}", { slug: spec.slug }),
  );

  const body = {
    name: spec.name,
    slug: spec.slug,
    html_template: spec.html_template,
    css: spec.css,
    is_default: spec.is_default,
  };

  if (existing === null) {
    const created = await pb.collection(Collections.CvTemplates).create(body);
    console.log(`  CREATE cv_templates         ${spec.slug}`);
    return { id: created.id, action: "created" };
  }

  const changed = diffFields(
    existing as unknown as Record<string, unknown>,
    body,
  );
  if (changed.length === 0) {
    console.log(`  SKIP   cv_templates         ${spec.slug} (up to date)`);
    return { id: existing.id, action: "skipped" };
  }

  await pb.collection(Collections.CvTemplates).update(existing.id, body);
  console.log(
    `  UPDATE cv_templates         ${spec.slug} (${changed.join(", ")})`,
  );
  return { id: existing.id, action: "updated" };
}

async function upsertCvVersion(
  pb: TypedPocketBase,
  spec: CvVersionSeed,
  templateIdBySlug: Map<string, string>,
  versionIdByLabel: Map<string, string>,
): Promise<{ id: string; action: UpsertResult }> {
  const templateId = templateIdBySlug.get(spec.templateSlug);
  if (templateId === undefined) {
    throw new Error(
      `cv_versions[${spec.label}] refers to missing template "${spec.templateSlug}"`,
    );
  }
  const parentId =
    spec.parentLabel === null ? "" : versionIdByLabel.get(spec.parentLabel);
  if (spec.parentLabel !== null && parentId === undefined) {
    throw new Error(
      `cv_versions[${spec.label}] refers to missing parent "${spec.parentLabel}"`,
    );
  }

  const existing = await findOne<CvVersionsResponse>(
    pb,
    Collections.CvVersions,
    pb.filter("label = {:label}", { label: spec.label }),
  );

  const body = {
    label: spec.label,
    source: spec.source,
    parent: parentId ?? "",
    markdown: spec.markdown,
    template: templateId,
    target_archetype: spec.target_archetype,
  };

  if (existing === null) {
    const created = await pb.collection(Collections.CvVersions).create(body);
    console.log(`  CREATE cv_versions          ${spec.label}`);
    return { id: created.id, action: "created" };
  }

  const changed = diffFields(
    existing as unknown as Record<string, unknown>,
    body,
  );
  if (changed.length === 0) {
    console.log(`  SKIP   cv_versions          ${spec.label} (up to date)`);
    return { id: existing.id, action: "skipped" };
  }

  await pb.collection(Collections.CvVersions).update(existing.id, body);
  console.log(
    `  UPDATE cv_versions          ${spec.label} (${changed.join(", ")})`,
  );
  return { id: existing.id, action: "updated" };
}

async function upsertApplication(
  pb: TypedPocketBase,
  spec: ApplicationSeed,
  versionIdByLabel: Map<string, string>,
): Promise<{ id: string; action: UpsertResult }> {
  const cvVersionId =
    spec.cv_version_label === null
      ? ""
      : versionIdByLabel.get(spec.cv_version_label);
  if (spec.cv_version_label !== null && cvVersionId === undefined) {
    throw new Error(
      `applications[${spec.company}/${spec.role}] refers to missing cv_version "${spec.cv_version_label}"`,
    );
  }

  const existing = await findOne<ApplicationsResponse>(
    pb,
    Collections.Applications,
    pb.filter("company = {:company} && role = {:role}", {
      company: spec.company,
      role: spec.role,
    }),
  );

  const body = {
    company: spec.company,
    role: spec.role,
    jd_source: spec.jd_source,
    jd_text: spec.jd_text,
    fit_score: spec.fit_score,
    status: spec.status,
    cv_version: cvVersionId ?? "",
    archetype: spec.archetype,
    comp_range: spec.comp_range,
    location: spec.location,
    applied_at:
      spec.applied_days_ago === null ? "" : daysAgoIso(spec.applied_days_ago),
    notes: spec.notes,
    pinned: spec.pinned,
  };

  if (existing === null) {
    const created = await pb.collection(Collections.Applications).create(body);
    console.log(`  CREATE applications         ${spec.company} / ${spec.role}`);
    return { id: created.id, action: "created" };
  }

  // `applied_at` drifts second-to-second because we compute "N days ago" from
  // `Date.now()`. Once it's non-empty on both sides, treat it as "set" so the
  // re-run diff ignores sub-day drift.
  const existingMap = existing as unknown as Record<string, unknown>;
  const bodyForDiff: Record<string, unknown> = { ...body };
  if (
    typeof existingMap.applied_at === "string" &&
    existingMap.applied_at !== "" &&
    typeof body.applied_at === "string" &&
    body.applied_at !== ""
  ) {
    bodyForDiff.applied_at = existingMap.applied_at;
  }

  const changed = diffFields(existingMap, bodyForDiff);
  if (changed.length === 0) {
    console.log(
      `  SKIP   applications         ${spec.company} / ${spec.role} (up to date)`,
    );
    return { id: existing.id, action: "skipped" };
  }

  await pb.collection(Collections.Applications).update(existing.id, body);
  console.log(
    `  UPDATE applications         ${spec.company} / ${spec.role} (${changed.join(", ")})`,
  );
  return { id: existing.id, action: "updated" };
}

async function seedEventsForApplication(
  pb: TypedPocketBase,
  applicationId: string,
  appLabel: string,
  events: EventSeed[],
): Promise<{ created: number; skipped: number }> {
  const existing = await pb.collection(Collections.Events).getList(1, 1, {
    filter: pb.filter("application = {:appId}", { appId: applicationId }),
  });

  if (existing.totalItems > 0) {
    console.log(
      `  SKIP   events               ${appLabel} (${existing.totalItems} already present)`,
    );
    return { created: 0, skipped: events.length };
  }

  for (const evt of events) {
    await pb.collection(Collections.Events).create({
      application: applicationId,
      type: evt.type,
      occurred_at: daysAgoIso(evt.days_ago),
      payload: null,
    });
  }
  console.log(
    `  CREATE events               ${appLabel} (${events.length} events)`,
  );
  return { created: events.length, skipped: 0 };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const url = requireEnv("NEXT_PUBLIC_POCKETBASE_URL");
  const email = requireEnv("POCKETBASE_ADMIN_EMAIL");
  const password = requireEnv("POCKETBASE_ADMIN_PASSWORD");

  const pb = new PocketBase(url) as TypedPocketBase;
  console.log(`→ PocketBase: ${url}`);

  try {
    await pb
      .collection(Collections.Superusers)
      .authWithPassword(email, password);
    console.log(`→ Authenticated as superuser: ${email}`);
  } catch (err) {
    console.error(`✗ Superuser authentication failed for ${email}`);
    if (err instanceof ClientResponseError) {
      console.error(`  ${err.status} ${err.message}`);
    } else if (err instanceof Error) {
      console.error(`  ${err.message}`);
    }
    process.exit(1);
  }

  console.log("");
  console.log("Seeding:");

  const templateIdBySlug = new Map<string, string>();
  for (const tpl of CV_TEMPLATES) {
    const { id } = await upsertCvTemplate(pb, tpl);
    templateIdBySlug.set(tpl.slug, id);
  }

  const versionIdByLabel = new Map<string, string>();
  for (const ver of CV_VERSIONS) {
    const { id } = await upsertCvVersion(
      pb,
      ver,
      templateIdBySlug,
      versionIdByLabel,
    );
    versionIdByLabel.set(ver.label, id);
  }

  const appIdByKey = new Map<string, string>();
  for (const app of APPLICATIONS) {
    const { id } = await upsertApplication(pb, app, versionIdByLabel);
    appIdByKey.set(`${app.company}|${app.role}`, id);
  }

  let eventsCreated = 0;
  let eventsSkipped = 0;
  for (const [key, events] of Object.entries(EVENTS_BY_APPLICATION)) {
    const applicationId = appIdByKey.get(key);
    if (applicationId === undefined) {
      console.warn(
        `  WARN   events               no application matches "${key}"`,
      );
      continue;
    }
    const result = await seedEventsForApplication(
      pb,
      applicationId,
      key,
      events,
    );
    eventsCreated += result.created;
    eventsSkipped += result.skipped;
  }

  console.log("");
  console.log(
    `Done. cv_templates=${CV_TEMPLATES.length}, ` +
      `cv_versions=${CV_VERSIONS.length}, ` +
      `applications=${APPLICATIONS.length}, ` +
      `events created=${eventsCreated} skipped=${eventsSkipped}.`,
  );
}

main().catch((err: unknown) => {
  if (err instanceof ClientResponseError) {
    console.error(`✗ ${err.status} ${err.message}`);
    if (err.data && Object.keys(err.data).length > 0) {
      console.error(JSON.stringify(err.data, null, 2));
    }
  } else if (err instanceof Error) {
    console.error(`✗ ${err.message}`);
  } else {
    console.error("✗", err);
  }
  process.exit(1);
});
