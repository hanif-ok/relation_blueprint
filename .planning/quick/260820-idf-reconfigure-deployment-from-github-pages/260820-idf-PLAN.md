---
quick_id: 260820-idf
phase: quick-260820-idf
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements:
  - "todo:2026-07-03-enable-coop-header-in-production-for-drive-oauth"
files_modified:
  - vite.config.ts
  - public/_headers
  - .github/workflows/deploy.yml
  - SETUP.md

must_haves:
  truths:
    - "Vite builds with a root base path (`/`) instead of the `/relation_blueprint/` subpath"
    - "The production build output carries a `_headers` file that sends the COOP header GIS OAuth needs"
    - "The GitHub Pages Actions workflow is removed from the repo"
    - "SETUP.md documents the Cloudflare Pages Git-integration deploy flow"
  artifacts:
    - path: "public/_headers"
      provides: "Cloudflare Pages COOP header rule for the deployed app"
      contains: "Cross-Origin-Opener-Policy: same-origin-allow-popups"
    - path: "vite.config.ts"
      provides: "Root base path + Cloudflare-oriented deploy comments"
      contains: "const BASE = '/';"
    - path: "SETUP.md"
      provides: "Cloudflare Pages deployment documentation"
      contains: "Cloudflare Pages"
  key_links:
    - from: "vite.config.ts"
      to: "public/_headers"
      via: "BASE='/' means Cloudflare serves from root; _headers (copied to dist root) supplies the COOP header the vite dev/preview server headers mirror"
      pattern: "same-origin-allow-popups"
---

<objective>
Reconfigure the app's deployment target from GitHub Pages to Cloudflare Pages (native Git
integration). GitHub Pages cannot send the `Cross-Origin-Opener-Policy: same-origin-allow-popups`
header that Google Identity Services (GIS) OAuth requires, so Drive auth breaks in production.
Cloudflare Pages serves from the domain root and can send custom headers via a `public/_headers`
file (Vite copies `public/` to the build output root, `dist/`).

This closes the standing todo `2026-07-03-enable-coop-header-in-production-for-drive-oauth`.

Make EXACTLY four changes — no more, no less:
1. `vite.config.ts` — flip `BASE` from the repo subpath to root `/`, and update the two
   GitHub-Pages-specific comment blocks to describe Cloudflare Pages.
2. `public/_headers` — new file with a `/*` COOP header rule.
3. Delete `.github/workflows/deploy.yml` (via `git rm`) — Cloudflare Pages builds via its own
   Git integration, not GitHub Actions.
4. `SETUP.md` — rewrite the deployment/hosting portion to document the Cloudflare Pages flow;
   preserve all other content (local dev, OAuth client creation).

Purpose: Unblock production Drive OAuth by moving to a headers-capable host.
Output: Root-base Vite config, a Cloudflare `_headers` file, removed Pages workflow, updated SETUP.md.

Do NOT touch `.env.e2e` (verified safe — only `VITE_E2E=true`).
</objective>

<execution_environment>
IMPORTANT — the executor runs in a git worktree where `node_modules` is ABSENT (gitignored,
not copied into worktrees). Therefore `npm run build`, `npm run typecheck`, and `tsc` WILL FAIL
for ENVIRONMENTAL reasons, not code reasons. DO NOT attempt a build or typecheck in this plan.

All verification is by file-content inspection only (Read / Grep, and `git status` for the
deletion). The orchestrator runs the real `npm run build` on the main tree (where `node_modules`
exists) after this worktree merges. Every `<verify>` below is intentionally build-free.
</execution_environment>

<context>
@.planning/STATE.md
@./.claude/CLAUDE.md
@vite.config.ts
@SETUP.md
@.github/workflows/deploy.yml
</context>

<tasks>

<task type="auto">
  <name>Task 1: Set root base + add Cloudflare COOP _headers file</name>
  <files>vite.config.ts, public/_headers</files>

  <action>
In `vite.config.ts`, change the single source-of-truth constant from the repo subpath to
root: set `const BASE` to `'/'`. This one edit cascades — `base`, the VitePWA `base`/`scope`,
the manifest `start_url`/`scope`, and the workbox `navigateFallback` all derive from `BASE`,
so no other assignment in the file changes. Do NOT edit the `server:`/`preview:` header blocks
or the `runtimeCaching`/`resolve` sections — dev and preview still need those COOP headers.

Then update the two GitHub-Pages-specific COMMENT blocks so the file's prose matches the new
host. (a) Replace the top comment block (currently the "GitHub Pages project site is served
from /relation_blueprint/…" block above the `BASE` const) with the Cloudflare-root explanation
given in "Reference: vite.config.ts top comment" below. (b) Replace the COOP warning comment
block just above `server:` (currently ending "…the PRODUCTION deploy must provide this COOP
header another way…") with the updated text in "Reference: vite.config.ts COOP comment" below,
which states the production deploy (Cloudflare Pages) now supplies the COOP header via
`public/_headers`. Also update the inline comment on the VitePWA `base: BASE` line if it still
says "GitHub Pages base" — change it to reflect root serving under Cloudflare Pages.

Create the new file `public/_headers` with the exact content in "Reference: public/_headers"
below. Cloudflare Pages reads `_headers` from the build output root; Vite copies everything in
`public/` into `dist/`, so the file must live at `public/_headers` (no extension, leading
underscore). The two-space indentation before the `Cross-Origin-Opener-Policy` line is
significant — Cloudflare's `_headers` format requires header lines indented under their path
pattern (`/*`).
  </action>

  <reference name="vite.config.ts top comment">
```
// Cloudflare Pages serves this app from the domain root (`/`), not a repo subpath.
// `base`, and the PWA `start_url`/`scope`, all derive from this const; keeping it at '/'
// means deployed assets resolve from the root and the service worker controls the root scope.
```
  </reference>

  <reference name="vite.config.ts COOP comment">
```
  // Google Identity Services' OAuth token popup needs THIS app to keep its opener↔popup link.
  // accounts.google.com sends a Cross-Origin-Opener-Policy header; unless the app is served with
  // `same-origin-allow-popups`, the browser severs the popup so GIS can't poll window.closed and
  // the flow dies with "Failed to open popup window" (see .planning/debug/resolved/
  // oauth-prompt-every-refresh.md). The header must come from whatever SERVES the app: set here
  // for `vite dev` (server) and `vite preview` (preview). In PRODUCTION, Cloudflare Pages supplies
  // the same COOP header via public/_headers (GitHub Pages could not send custom response headers —
  // the reason for this move), so Drive OAuth works in production exactly as in dev.
```
  </reference>

  <reference name="public/_headers">
```
# Cloudflare Pages reads this file from the build output root (Vite copies public/ -> dist/).
# Google Identity Services' OAuth token popup needs the app to keep its opener<->popup link;
# without same-origin-allow-popups the browser severs the popup and GIS Drive auth dies.
# GitHub Pages could not send this header (why we moved to Cloudflare Pages); _headers is how
# Cloudflare Pages supplies it in production. Mirrors the vite dev/preview server headers.
/*
  Cross-Origin-Opener-Policy: same-origin-allow-popups
```
  </reference>

  <verify>
    <automated>Read public/_headers and confirm it contains the `/*` line and, indented below it, `Cross-Origin-Opener-Policy: same-origin-allow-popups`. Grep vite.config.ts for the fixed string `const BASE = '/';` (with trailing semicolon — this uniquely matches the root value, not the old subpath). Grep vite.config.ts (case-insensitive) for `Cloudflare` and confirm it appears in BOTH the top comment and the COOP comment block. No build/typecheck — node_modules is absent in the worktree.</automated>
  </verify>

  <done>
`const BASE = '/';` is the sole BASE assignment in vite.config.ts; the `server`/`preview`
COOP header blocks are untouched; both rewritten comment blocks reference Cloudflare Pages;
`public/_headers` exists with the `/*` rule and the indented COOP header line.
  </done>
</task>

<task type="auto">
  <name>Task 2: Remove GitHub Pages workflow + document Cloudflare Pages deploy in SETUP.md</name>
  <files>.github/workflows/deploy.yml, SETUP.md</files>

  <action>
Delete the GitHub Pages workflow using `git rm .github/workflows/deploy.yml` (stage the
deletion so it is part of this change). Cloudflare Pages builds via its own Git integration
(it watches the GitHub repo and builds on push), so the GitHub Actions deploy job is obsolete.

Rewrite the deployment/hosting portion of `SETUP.md` to document the Cloudflare Pages
Git-integration flow instead of GitHub Pages. PRESERVE all non-deployment content — the
"Run the app locally" section, the full OAuth 2.0 Client ID creation steps, and the
"Why drive.file" section stay. Update every GitHub-Pages-specific hosting reference so the
doc is internally consistent:
  - Add a deployment section covering, in order: (a) push the repo to GitHub; (b) in the
    Cloudflare dashboard create a Pages project and connect the GitHub repo; (c) set build
    command `npm run build` and build output directory `dist`; (d) set the environment
    variable `VITE_GOOGLE_CLIENT_ID` (the public OAuth Client ID — not a secret) in the
    Cloudflare Pages project settings; (e) after the first deploy, add the resulting
    `https://<project>.pages.dev` origin to the Google OAuth client's Authorized JavaScript
    origins in Google Cloud Console; (f) a short note on WHY Cloudflare Pages rather than
    GitHub Pages — the `Cross-Origin-Opener-Policy: same-origin-allow-popups` header GIS OAuth
    needs, which GitHub Pages cannot send and which `public/_headers` supplies on Cloudflare.
  - Update the OAuth "Authorized JavaScript origins" step (currently lists a `github.io`
    production origin) to reference the Cloudflare `https://<project>.pages.dev` origin
    instead of the GitHub Pages origin.
  - Update the old "repository variable for the deployed GitHub Pages build" step (which
    pointed at GitHub Actions Variables) so it points at the Cloudflare Pages project's
    environment-variable settings.
  - Fix the stale `npm run build` table note that says "(GitHub Pages base path)" so it no
    longer references GitHub Pages (e.g. "(root base path, static dist/ bundle)").

Do NOT touch `.env.e2e`.
  </action>

  <verify>
    <automated>Confirm `.github/workflows/deploy.yml` no longer exists (Read returns not-found) and `git status --porcelain .github/workflows/deploy.yml` shows it staged for deletion (a `D` entry). Grep SETUP.md (case-insensitive) and confirm ALL of these appear: `Cloudflare Pages`, `pages.dev`, `npm run build`, `dist`, and `VITE_GOOGLE_CLIENT_ID`. Confirm the local-dev section and the OAuth Client ID creation steps are still present (grep for `Create the Google Cloud OAuth 2.0 Client ID` and `drive.file`). No build/typecheck — node_modules is absent in the worktree.</automated>
  </verify>

  <done>
`.github/workflows/deploy.yml` is deleted (staged as `D`); SETUP.md documents the Cloudflare
Pages Git-integration flow (connect repo, build `npm run build` → `dist`, set
`VITE_GOOGLE_CLIENT_ID`, add `<project>.pages.dev` to Google Authorized origins, why-Cloudflare
note) while preserving local-dev and OAuth-client-creation content; no `github.io`/GitHub-Pages
hosting references remain.
  </done>
</task>

</tasks>

<verification>
All checks are file-content only (worktree has no node_modules — see execution_environment):

- `vite.config.ts` contains exactly `const BASE = '/';`; `server`/`preview` COOP blocks intact;
  both comment blocks mention Cloudflare Pages.
- `public/_headers` exists with `/*` and an indented `Cross-Origin-Opener-Policy: same-origin-allow-popups`.
- `.github/workflows/deploy.yml` is removed (git shows `D`).
- `SETUP.md` documents the Cloudflare Pages flow and no longer references GitHub Pages hosting.
- `.env.e2e` is unchanged.

The orchestrator runs the real `npm run build` on the main tree after merge to confirm the
root-base bundle compiles.
</verification>

<success_criteria>
- BASE flipped to `/`; all derived paths (base, PWA base/scope, manifest start_url/scope,
  workbox navigateFallback) now resolve from root via the single const change.
- Cloudflare-servable `public/_headers` supplies the COOP header GIS OAuth requires in production.
- GitHub Pages deploy workflow removed.
- SETUP.md is an accurate Cloudflare Pages deployment guide with local-dev + OAuth-setup content preserved.
- Exactly the four intended files changed; `.env.e2e` untouched.
</success_criteria>

<output>
Create `.planning/quick/260820-idf-reconfigure-deployment-from-github-pages/260820-idf-SUMMARY.md` when done.
</output>
