# GitHub Pages Deployment — Design

Date: 2026-07-14
Status: Approved

## Goal

Make the apartment planner reachable outside the local network at a stable public
URL: `https://alextrevgoda.github.io/home-plan/`.

## Decision

Permanent static hosting on GitHub Pages, deployed by GitHub Actions on every push
to `main`. Chosen over Cloudflare Pages / Netlify / Vercel because the `gh` CLI is
already authenticated — no new accounts. Trade-off accepted by the user: the repo
must be public on the free plan, so the source code becomes visible.

## Changes

1. **`vite.config.ts`** — set `base: '/home-plan/'` for production builds only
   (`command === 'build'`), so assets resolve on the Pages subpath while local dev
   stays at `localhost:5173/`.
2. **GitHub repo** — create public repo `alextrevgoda/home-plan`, add as `origin`,
   push `main`.
3. **`.github/workflows/deploy.yml`** — on push to `main`: `npm ci` →
   `npm run build` (includes `tsc --noEmit`) → publish `dist/` with
   `actions/upload-pages-artifact` + `actions/deploy-pages`. Pages source set to
   "GitHub Actions" via `gh api`.

## Non-changes

Single-page app with no router and localStorage persistence: no SPA 404 fallback,
no backend, no data migration. Plans remain per-browser.

## Out of scope

Custom domain, favicon 404 fix, analytics.

## Verification

Load the public URL in headless Chrome (playwright-core + `channel: 'chrome'`,
per the repo's established E2E method) and confirm the 2D and 3D views render.
