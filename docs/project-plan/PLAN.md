# Career-Ops Web — Project Plan

A browser-based layer over [career-ops](https://github.com/santifer/career-ops) for personal use, with application tracking, CV version history, and custom PDF generation. This document is the authoritative plan we work against; it updates as decisions are made or reversed.

---

## 1. Goal

Replace the career-ops terminal workflow with a web UI while reusing career-ops as the AI evaluation engine. End state: paste a job description URL in a browser, get a tailored CV and structured evaluation, track the full lifecycle of every application in a Kanban pipeline — all over Tailscale from desktop or phone, backed by PocketBase, powered by Claude Code under a Max subscription (no API keys).

---

## 2. Strategic Decisions (Locked)

These are settled. Revisiting requires an explicit change here with rationale.

| # | Decision | Rationale |
|---|---|---|
| 1 | **Personal tool, not a product.** Single-user, no multi-tenancy. | Avoids the auth, billing, and support burden of a SaaS. Product pivot is possible later if genuine demand emerges. |
| 2 | **Staged rollout: sync-only (A) → browser-triggered evaluations (B).** Data model and UI built for B from day one. | Shortest path to daily value without throwing away work. Option A+ is the bridge. |
| 3 | **Dev on Mac, production on US VPS.** Single codebase, environment-selected config. | Mac for speed of iteration, VPS for phone/away-from-desk access over Tailscale. |
| 4 | **Async with polling, not sync.** `POST /api/jobs` returns a `job_id`; UI polls `GET /api/jobs/:id` every 2s until terminal state. | Sync HTTP dies on 60–120s evaluations; a full queue (BullMQ/Redis) is overkill for single-user. |
| 5 | **PocketBase is the canonical store. Career-ops owns only its own filesystem artefacts.** A sync layer mirrors career-ops outputs into PocketBase. Web UI reads only from PocketBase. | If career-ops breaks or upstream merges corrupt state, the database is unaffected. |
| 6 | **Career-ops fork stays unmodified except for the CV template fork-point** (which is being replaced entirely anyway — see #7). | Keeps upstream merges trivial. |
| 7 | **Custom PDF generation lives in the web app, not in career-ops.** Career-ops emits tailored CV markdown only; web app renders to PDF via Playwright using Mayor-branded templates. | Unlocks multi-template support, live preview, per-application styling, and isolates us from upstream PDF changes. Design is from scratch. |
| 8 | **Tailscale is the auth boundary.** No NextAuth, no Clerk, no user accounts. App binds to localhost or tailnet IP only. | Massive complexity saving; access list is literally the tailnet. |
| 9 | **One surgical modification to career-ops `modes/pdf.md` to emit tailored CV markdown.** Approved under the decision #6 exception for the CV template fork-point. | Career-ops' default PDF pipeline doesn't persist tailored markdown to disk, only the PDF. Our sync layer (Phase 1) and custom PDF templates (Phase 2) both need the markdown. This is the minimum viable modification to unblock both phases. |

---

## 3. Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                         Mac / Phone (Tailscale)                     │
│                                                                      │
│   Browser ─────────────── http://itfac3-us:3000 ─────────────────   │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│                    US VPS (Tailscale + Docker)                      │
│                                                                      │
│   ┌─────────────────────┐    ┌─────────────────────────────────┐   │
│   │   Next.js Web App   │    │  PocketBase (career-ops)         │   │
│   │   (port 3000)       │────│  port 8094                       │   │
│   │                     │    │  collections: applications,      │   │
│   │   - App Router UI   │    │  cv_versions, events, jobs,      │   │
│   │   - API routes      │    │  cv_templates                    │   │
│   │   - PDF render      │    └─────────────────────────────────┘   │
│   │     (Playwright)    │                                            │
│   └──────────┬──────────┘                                            │
│              │ child_process.spawn                                   │
│              ▼                                                        │
│   ┌─────────────────────┐                                            │
│   │   Claude Code CLI   │                                            │
│   │   (auth: long-lived │                                            │
│   │    token)           │                                            │
│   └──────────┬──────────┘                                            │
│              │ reads / writes                                        │
│              ▼                                                        │
│   ┌─────────────────────┐                                            │
│   │   career-ops/       │                                            │
│   │   (this repo)       │                                            │
│   │   - cv.md           │                                            │
│   │   - reports/*.md    │                                            │
│   │   - output/*.pdf    │◀── ignored; we generate our own           │
│   │   - data/tracker.tsv│                                            │
│   └─────────────────────┘                                            │
└────────────────────────────────────────────────────────────────────┘
```

### Data Flow — Evaluating a New Job

1. User pastes JD URL/text in browser.
2. `POST /api/jobs` creates a `jobs` record with `status=queued`, returns `job_id`.
3. Backend worker picks up the job, spawns `claude -p "/career-ops <jd>"` as a child process in the `career-ops/` working directory.
4. `status=running`, progress lines streamed into `jobs.log`.
5. On process exit, sync layer parses the new files in `reports/` and tailored CV markdown, creates `applications` and `cv_versions` records.
6. PDF generator reads the CV markdown, renders via Playwright using the selected template, uploads PDF to the `cv_versions` record.
7. `status=done`. Polling frontend picks up the completion and navigates to the new application's detail page.

### Data Flow — CLI-First Mode (Phase 1 only)

1. User runs `/career-ops <jd>` in terminal as today.
2. File watcher (or polling scan every 30s) notices new files in `reports/` and `data/tracker.tsv`.
3. Sync layer mirrors data into PocketBase.
4. Web UI reflects state automatically.

---

## 4. Data Model (PocketBase)

Field types use PocketBase's native types. All collections have default `id`, `created`, `updated`.

### `applications`

| Field | Type | Notes |
|---|---|---|
| company | text | required |
| role | text | required |
| jd_url | url | optional |
| jd_text | text | full JD, long-form |
| jd_source | select | `manual`, `career-ops-scan`, `paste` |
| fit_score | number | 0–5 scale from evaluation |
| status | select | `discovered`, `evaluated`, `applied`, `interview`, `offer`, `rejected`, `withdrawn` |
| cv_version | relation | → `cv_versions`, the one actually used for this application |
| archetype | text | e.g. "AI/ML Engineer", "Solutions Architect" — from career-ops classifier |
| comp_range | text | salary range from evaluation |
| location | text | remote / hybrid / city |
| applied_at | date | null until status=applied |
| evaluation_report_md | text | full markdown report from career-ops |
| evaluation_report_path | text | path on disk in career-ops/reports/ for reference |
| notes | text | user's free-form notes |
| pinned | bool | starred/pinned for quick access |

### `cv_versions`

| Field | Type | Notes |
|---|---|---|
| label | text | human-readable, e.g. "AI Engineer — Anthropic tailored" |
| source | select | `base`, `tailored`, `manual_edit` |
| parent | relation | → `cv_versions`, null for base |
| markdown | text | the full CV markdown |
| pdf | file | rendered PDF, generated on save |
| template | relation | → `cv_templates` |
| target_archetype | text | what career-ops classified this version for |
| used_for_applications | relation (multi) | back-ref to `applications` (derived view) |

### `cv_templates`

| Field | Type | Notes |
|---|---|---|
| name | text | e.g. "Mayor Classic", "Minimal Modern" |
| slug | text | unique, used in URLs |
| html_template | text | Handlebars/EJS template consumed by Playwright |
| css | text | scoped CSS |
| preview_image | file | thumbnail for the template picker |
| is_default | bool | one default |

### `events`

| Field | Type | Notes |
|---|---|---|
| application | relation | → `applications` |
| type | select | `created`, `evaluated`, `applied`, `interview_scheduled`, `interview_done`, `rejected`, `offer_received`, `offer_accepted`, `offer_declined`, `withdrawn`, `note_added`, `status_changed` |
| occurred_at | date | when the real-world event happened |
| payload | json | type-specific structured data |

Events are the timeline and the foundation of future learning-loop analysis (pattern detection across outcomes).

### `jobs`

| Field | Type | Notes |
|---|---|---|
| type | select | `evaluate_jd`, `generate_pdf`, `rescan_tracker`, `regenerate_cv` |
| status | select | `queued`, `running`, `done`, `failed`, `cancelled` |
| input | json | job parameters (JD URL, application_id, etc.) |
| output | json | result references (application_id created, pdf file id, etc.) |
| log | text | stdout/stderr appended as it arrives |
| error | text | populated on failure |
| started_at | date | |
| finished_at | date | |
| application | relation | → `applications`, null until created |

---

## 5. Phased Delivery

Each phase leaves the system in a fully working state. No dead code between phases.

### Phase 0 — Foundation

**Goal:** Functional web app scaffold with PocketBase connected and a usable (if empty) Kanban.

- [ ] PocketBase collections created and rules set (admin-only writes via admin SDK; reads open within tailnet is acceptable given trust model)
- [ ] Next.js 14 (App Router) project in `web/` subdirectory of the fork
- [ ] Tailwind + shadcn/ui configured
- [ ] PocketBase JS SDK wired with typed collection clients
- [ ] Env config: `POCKETBASE_URL`, `CAREER_OPS_DIR`, `CLAUDE_CODE_PATH`
- [ ] Base layout: sidebar (Pipeline, CVs, Templates, Settings), topbar
- [ ] Kanban board reading `applications`, drag-and-drop column changes write back to PocketBase
- [ ] Manual "New Application" form (company, role, JD paste, status) — proves data flow without any AI
- [ ] Application detail page (read-only for now)
- [ ] Seed a few fake applications so the UI isn't empty

**Acceptance:** You can create, view, and move applications manually via browser. No career-ops integration, no AI.

### Phase 1 — Sync Layer (CLI-first mode) ✅ COMPLETE

**Goal:** Career-ops runs in terminal as normal; web app reflects its output.

- [x] ~~Parser for `data/tracker.tsv`~~ — replaced by `parseReport` (reports/*.md). Tracker deprecated per 2026-04-24 decision; the web Kanban is the canonical tracker.
- [ ] Parser for `reports/*.md` → structured extraction (score, archetype, comp, summary)
- [ ] Parser for tailored CV markdown files → `cv_versions` records
- [ ] Sync service: scans career-ops dirs on schedule (30s) and on file-change events (chokidar)
- [ ] Idempotent upsert logic (deterministic hash of JD + company + role as natural key)
- [ ] Detail page renders the full evaluation report (markdown → HTML)
- [ ] Uploads career-ops-generated PDFs as placeholders (we'll replace with our own in Phase 2)

**Acceptance:** Run `/career-ops <jd>` in terminal, within 30s the browser shows the new application on the Kanban with evaluation, linked CV version, and downloadable PDF.

### Phase 2 — Custom PDF Pipeline

**Goal:** Our own CV templates replace career-ops' PDF output.

- [ ] Template designer spec: typography, spacing, colour, section layout, print constraints
- [ ] **Design review before any code** — one round of mockups, agreed between us
- [ ] "Mayor Classic" template implemented as HTML + CSS + Handlebars
- [ ] "Minimal Modern" second template for contrast/options
- [ ] Playwright-based PDF render service: markdown + template → PDF buffer
- [ ] Preview endpoint: renders template with a CV version to live HTML in an iframe
- [ ] Template picker UI on CV version detail page
- [ ] Bypass career-ops' PDF mode; our pipeline is source of truth for PDFs

**Acceptance:** CVs generated by the system look the way you want. You can swap templates per application and preview before downloading.

### Phase 3 — Browser-Triggered Evaluation

**Goal:** Never need the terminal again.

- [ ] `POST /api/jobs` endpoint with `type=evaluate_jd`
- [ ] Job runner: spawns `claude -p "/career-ops <jd>"` with working dir = `CAREER_OPS_DIR`
- [ ] Streaming stdout/stderr to `jobs.log`, updates `status` transitions
- [ ] Polling API: `GET /api/jobs/:id`
- [ ] Frontend job modal: accepts JD URL or pasted text, shows live progress, redirects to new application on completion
- [ ] Timeout + cancellation (kill child process)
- [ ] Manual re-evaluate action on existing applications

**Acceptance:** Paste a JD URL in the browser, 60–120s later the evaluation is complete, the tailored CV is rendered, and the application is on the Kanban.

### Phase 4 — VPS Migration

**Goal:** Backend runs on the US VPS; phone access over Tailscale.

- [ ] Node runtime + Claude Code installed on VPS (`claude setup-token` for long-lived auth)
- [ ] Playwright Chromium deps installed
- [ ] career-ops repo cloned to VPS, `cv.md` and profile synced
- [ ] Next.js built in production mode, systemd unit
- [ ] Tailscale-only binding (verify not reachable on public IP)
- [ ] Test full flow from phone on mobile data (via Tailscale)

**Acceptance:** Mac can be off; you can paste a JD URL from your phone, wait, open the resulting application in the browser.

---

## 6. Out of Scope for v1

Explicitly deferred. If any of these become urgent, raise it here as a decision first.

- Public deployment, real auth, multi-user, billing
- Portal scanner UI (career-ops CLI `/career-ops scan` remains available; results are ingested by the sync layer)
- Interview prep / STAR story bank UI
- Company deep-dive research view
- LinkedIn outreach generator
- Negotiation scripts UI
- Analytics / insights dashboard (needs ≥20 applications of data first)
- Native mobile app (mobile web over Tailscale is enough)
- Batch evaluation UI (CLI `/career-ops batch` remains available)
- Automated application submission (career-ops' `/apply` mode stays CLI-only; too much risk surface for automation)

---

## 7. Repository Layout

Monorepo. The web app lives alongside career-ops in its own subdirectory so upstream merges don't conflict.

```
career-ops/                  (this fork)
├── <upstream files>         (unchanged — modes/, batch/, dashboard/, etc.)
├── docs/                    (upstream; we add project-plan/ subdirectory only)
│   └── project-plan/
│       └── PLAN.md          (this document)
├── web/                     (new — our code)
│   ├── package.json
│   ├── next.config.js
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx             # Kanban
│   │   │   ├── applications/[id]/
│   │   │   ├── cvs/
│   │   │   └── templates/
│   │   └── api/
│   │       ├── jobs/
│   │       └── sync/
│   ├── lib/
│   │   ├── pocketbase.ts
│   │   ├── sync/                    # parsers for career-ops outputs
│   │   ├── pdf/                     # Playwright renderer
│   │   └── jobs/                    # claude -p runner
│   ├── templates/                   # CV HTML/CSS templates
│   │   ├── mayor-classic/
│   │   └── minimal-modern/
│   └── components/
├── pb_migrations/           (new — PocketBase schema migrations)
└── .env.example             (new — our env vars, merges with upstream gracefully)
```

The `web/`, `pb_migrations/`, and `docs/project-plan/` paths don't exist upstream, so `git pull upstream main` will never touch them.

---

## 8. Tech Stack

Concrete choices — change requires a decision-log entry.

- **Runtime:** Node.js 20 LTS
- **Framework:** Next.js 16 App Router + TypeScript + Turbopack (dev default)
- **React:** React 19
- **UI:** Tailwind v4 + shadcn/ui + lucide-react icons
- **Drag-drop:** dnd-kit (Kanban)
- **Data:** PocketBase 0.36.7 (already deployed, port 8094 on US VPS)
- **PB client:** official `pocketbase` JS SDK with TypeScript generics
- **PDF:** Playwright (Chromium) + Handlebars for templating
- **Markdown:** `remark` + `rehype` for HTML rendering, `gray-matter` for frontmatter
- **File watching (sync):** `chokidar`
- **Process management:** Node `child_process.spawn` (no PM2/BullMQ)
- **AI execution:** Claude Code CLI (`claude -p`) under Max subscription
- **Deployment:** systemd on Ubuntu (VPS), plain `npm run dev` (Mac)
- **Version control:** Git, fork tracks `santifer/career-ops` upstream

---

## 9. Decisions Log

Append-only record of choices made during build. Date + rationale required.

| Date | Decision | Rationale |
|---|---|---|
| 2026-04-23 | Project plan locked at v1 (this document) | Initial scope agreed between Mayor and Claude |
| 2026-04-23 | PocketBase instance for career-ops live on US VPS :8094 | Follows existing muchobien/pocketbase Docker pattern |
| 2026-04-23 | CV templates built from scratch, not inherited from career-ops | User dislikes Space Grotesk + DM Sans default |
| 2026-04-23 | PLAN.md located at docs/project-plan/PLAN.md | Keeps repo root clean |
| 2026-04-23 | Stack upgraded to Next.js 16 + React 19 + Tailwind v4 during Phase 0 scaffold | `create-next-app@latest` pulled current versions; all stable, App Router API compatible, Turbopack is now default — no reason to downgrade to 14 |
| 2026-04-24 | Phase 1 architecture corrected: career-ops emits to `reports/*.md` and `output/*.pdf` by default; tailored CV markdown requires a one-line modification to `modes/pdf.md`. Tracker (`data/applications.md`) is ignored — the web Kanban is our tracker. | Discovered during Phase 1 kickoff that career-ops' default pipeline doesn't persist intermediate markdown or auto-append to the tracker. Rather than work around this in the web app, a surgical pdf.md modification unblocks both Phase 1 and Phase 2 cleanly. |
| 2026-04-24 | Text fields carrying long-form content (evaluation reports, CV markdown, HTML templates, CSS, job logs) set to max=1,000,000 chars in pb-schema.ts | PocketBase's 5000-char default broke real-world career-ops output. Large max prevents future breakage and makes pb-schema.ts the durable source of truth. Short identifier fields keep the default. |
| 2026-04-24 | Phase 1 complete: chokidar watcher with 2s debounce + manual Server Action for browser-triggered sync. Sync state persisted in a dedicated `sync_state` collection (singleton row). | Debounce coalesces career-ops' multi-file bursts into one sync. Singleton collection avoids a separate store for something PB can already handle. |

---

## 10. Open Questions

Track as we hit them. Resolve by adding to the Decisions Log above.

- What's the canonical CV source-of-truth — `cv.md` in the repo, or a `cv_versions` record in PocketBase flagged as `source=base`? (Leaning: PocketBase, with an export-to-`cv.md` utility for when career-ops needs it on disk.)
- Do we keep career-ops' `data/tracker.tsv` in sync (bidirectional) or just read from it? (Leaning: read-only; our write path is PocketBase.)
- Template design direction — colour palette, typography, layout. To be resolved at start of Phase 2 via dedicated design review.
- Company slug matching uses a pragmatic heuristic (`companySlugMatches`): exact match, or one slug is a hyphen-prefix of the other. This handles career-ops' convention of dropping corporate suffixes ("GlobalData Plc" → `globaldata` filename slug). Brittle for renames or pathological slugs; revisit if it bites. Introduced in commit 923e2157.
- `setup-pocketbase.ts` currently diffs fields by name only and ignores constraint changes (max, min, pattern). Adequate for v1 additive schema. Revisit if a future change requires tightening existing constraints. Flagged by Claude Code in commit 069a9336.

---

*Document owner: Mayor. Updates tracked via git history on this file.*