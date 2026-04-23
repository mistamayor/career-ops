# Career-Ops Web

Browser-based layer over [career-ops](https://github.com/santifer/career-ops) for personal use: application tracking, CV version history, and custom PDF generation. This directory is the Next.js web app that sits alongside the upstream career-ops CLI in the same monorepo. See [`../docs/project-plan/PLAN.md`](../docs/project-plan/PLAN.md) for the authoritative plan — scope, phases, data model, and decisions live there.

## Setup

The scaffold was generated once from the repo root with:

```bash
npx create-next-app@latest web --typescript --tailwind --app --src-dir --eslint --import-alias "@/*" --use-npm --no-turbo
cd web
npm install pocketbase @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities lucide-react react-markdown remark-gfm rehype-raw zod react-hook-form @hookform/resolvers date-fns class-variance-authority clsx tailwind-merge sonner
npx shadcn@latest init -d
npx shadcn@latest add button card dialog dropdown-menu input label select separator tabs textarea badge avatar sonner form
cp .env.example .env.local   # fill in POCKETBASE_ADMIN_PASSWORD locally
```

To reproduce on a fresh clone, the only step required is:

```bash
cd web
npm install
cp .env.example .env.local
```

## Dev

```bash
npm run dev
```

Serves on http://localhost:3000. Environment variables are read from `.env.local` (ignored by git).

## Source of truth

[`../docs/project-plan/PLAN.md`](../docs/project-plan/PLAN.md) — plan, architecture, data model, phase goals, decisions log.
