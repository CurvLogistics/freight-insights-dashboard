# FreightOps Insights

Freight logistics intelligence dashboard for Curv Logistics.

## Stack

- React + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- Supabase (reporting database)
- Recharts

## Local development

```bash
npm install
npm run dev
```

## Supabase reporting data

While Turvo API access is pending:

1. Apply `supabase/migrations/20260721220000_create_reporting_loads.sql` in the Supabase SQL Editor (one-time).
2. Seed the bundled Turvo export: `npm run seed:loads`
3. Or use **Import Turvo CSV** in the app sidebar to upsert a fresh Turvo CSV export into Supabase.

## Turvo API credentials (server-side)

The `turvo-proxy` edge function (used by Settings → Turvo Connection) reads Turvo credentials from
Supabase secrets first, so they never need to be typed into the browser or leave the server:

```bash
supabase secrets set \
  TURVO_BASE_URL=https://publicapi.turvo.com/v1 \
  TURVO_USERNAME=your-turvo-username \
  TURVO_PASSWORD=your-turvo-password \
  TURVO_CLIENT_ID=your-client-id \
  TURVO_CLIENT_SECRET=your-client-secret \
  TURVO_API_KEY=your-api-key
```

Redeploy the function after setting secrets: `supabase functions deploy turvo-proxy`.

Without server-side secrets configured, the Settings page falls back to sending whatever you type into the
credential fields — useful for local testing, but only the Base URL and Username are remembered across
sessions; Password, Client Secret, and API Key are never persisted in the browser.

## Deployment (Vercel)

1. Import this repo into Vercel (New Project → select the repo). It auto-detects Vite via `vercel.json`.
2. Set environment variables in the Vercel project (Settings → Environment Variables):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
3. Every push to `main` deploys to production; every PR gets a preview deployment — both handled by Vercel's
   git integration, no extra config needed.

`.github/workflows/ci.yml` runs on every push/PR as a separate quality gate: `npm ci`, tests, and a production
build (lint runs too but is non-blocking — there's existing lint debt tracked separately). This is independent
of the Vercel deploy; it just fails the GitHub check if the build or tests break. If you want CI to also gate
Vercel's build, add `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` as GitHub Actions repo secrets
(Settings → Secrets and variables → Actions) — the workflow already reads them.
