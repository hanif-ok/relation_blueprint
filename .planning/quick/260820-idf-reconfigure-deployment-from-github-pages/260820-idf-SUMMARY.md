---
status: complete
quick_id: 260820-idf
description: Reconfigure deployment from GitHub Pages to Cloudflare Pages (Git integration)
date: 2026-08-20
commits:
  - 0c0b1fe
  - 4d8038f
---

# Quick Task 260820-idf: Reconfigure deployment → Cloudflare Pages

## Goal

Switch the production deploy target from GitHub Pages to **Cloudflare Pages** (native
Git integration). GitHub Pages cannot send the `Cross-Origin-Opener-Policy:
same-origin-allow-popups` header that Google Identity Services (GIS) OAuth requires, so
Drive auth broke in production. Cloudflare Pages serves from the domain root and can send
custom headers via a `_headers` file, resolving the blocker.

## Changes (4 files, exactly scoped)

1. **vite.config.ts** — `const BASE = '/relation_blueprint/'` → `const BASE = '/'`. The
   single-const change cascades to `base`, VitePWA `base`/`scope`, manifest
   `start_url`/`scope`, and workbox `navigateFallback`. The two GitHub-Pages explanatory
   comment blocks (top subpath note + COOP warning) were rewritten to describe Cloudflare
   Pages + `public/_headers`. The `server`/`preview` COOP header blocks were left intact
   (dev + preview still need them).
2. **public/_headers** (new) — `/*` rule sending
   `Cross-Origin-Opener-Policy: same-origin-allow-popups`. Vite copies `public/` → `dist/`,
   so Cloudflare Pages reads it from the build output root.
3. **.github/workflows/deploy.yml** — deleted (`git rm`). The GitHub Pages Actions workflow
   is retired; Cloudflare Pages builds via its own Git integration.
4. **SETUP.md** — deployment/hosting section rewritten to the Cloudflare Pages
   Git-integration flow: connect repo in the CF dashboard, build command `npm run build`,
   output dir `dist`, set `VITE_GOOGLE_CLIENT_ID` env var, add `<project>.pages.dev` to the
   Google OAuth client's Authorized JavaScript origins, plus a why-Cloudflare (COOP) note.
   Local-dev + OAuth-client-creation content preserved; stale `github.io` references updated.

`.env.e2e` left untouched (verified safe — only `VITE_E2E=true`).

## Verification

- Executor verified by file-content inspection only (worktree has no `node_modules`).
- **Orchestrator ran the real `npm run build` on the main tree post-merge: ✓ built in 16.1s**
  (`tsc --noEmit` clean, PWA service worker generated). `dist/index.html` references
  `/assets/...` (root-relative, correct for Cloudflare); `dist/_headers` present with the
  COOP rule; no functional `/relation_blueprint/` paths remain in `dist/`.

## Commits

- `0c0b1fe` — feat: set root base + add Cloudflare COOP `_headers`
- `4d8038f` — docs: remove Pages workflow + document Cloudflare deploy

## Follow-up (outside this task)

- Create the public GitHub repo `relation_blueprint` and push (orchestrator handles).
- Connect the repo in Cloudflare Pages, set `VITE_GOOGLE_CLIENT_ID`, add the `pages.dev`
  origin to Google OAuth Authorized JavaScript origins.
