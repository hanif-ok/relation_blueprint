---
phase: 01-storage-spine-first-person-on-a-map
plan: 01
subsystem: scaffold
tags: [vite, react, typescript-strict, vitest, playwright, fake-indexeddb, github-pages, pwa-base, oauth-setup]

# Dependency graph
requires: []
provides:
  - "React 19.2 + Vite 7 + TypeScript (strict) static SPA, base path /relation_blueprint/ for GitHub Pages"
  - "Locked dependency set (react-konva, cytoscape, dexie, minisearch, zod, megajs, vite-plugin-pwa, browser-image-compression)"
  - "Vitest (jsdom + fake-indexeddb) + Playwright test harness, tests/setup.ts wiring"
  - ".github/workflows/deploy.yml — GitHub Actions static deploy to GitHub Pages"
  - "SETUP.md — blocking Google Cloud OAuth Client ID (drive.file) setup instructions"
affects: [data-backbone, walking-skeleton, sync-engine, drive-backend, media, backup, pwa]

# Tech tracking
tech-stack:
  added:
    - "vite 7 + @vitejs/plugin-react"
    - "react 19.2 + react-dom 19.2"
    - "typescript 5 (strict)"
    - "vitest 4 + jsdom + fake-indexeddb"
    - "@playwright/test"
    - "eslint flat config + prettier"
  patterns:
    - "Static SPA, no backend — Vite base set to the GitHub Pages repo subpath so deployed assets resolve"
    - "fake-indexeddb imported in tests/setup.ts so Dexie runs under node/jsdom"
    - "OAuth Client ID is a public identifier (VITE_GOOGLE_CLIENT_ID); no client secret, no refresh token (GIS token model)"

key-files:
  created:
    - package.json
    - package-lock.json
    - vite.config.ts
    - tsconfig.json
    - tsconfig.node.json
    - index.html
    - .env.example
    - eslint.config.js
    - .prettierrc
    - .gitignore
    - src/main.tsx
    - src/app/App.tsx
    - src/app/App.module.css
    - src/vite-env.d.ts
    - vitest.config.ts
    - playwright.config.ts
    - tests/setup.ts
    - tests/_fixtures/README.md
    - .github/workflows/deploy.yml
    - SETUP.md
  modified: []

key-decisions:
  - "ESLint flat config (eslint.config.js) instead of the plan's .eslintrc.cjs — flat config is the ESLint 9 default and what the toolchain expects"
  - "GIS script tag in index.html and drive.file-only scope documented up front in SETUP.md (T-01-01: consent screen must be human-verified to list only drive.file)"
  - "OAuth Client ID creation surfaced EARLY as a blocking human prerequisite, but DEFERRED to phase-end verification per user choice (only needed at runtime for live Drive connect — Plan 06)"

patterns-established:
  - "Strict TypeScript from line one to prevent data-model drift across storage providers"
  - "Test harness (Vitest + Playwright + fake-indexeddb) present before any feature code"

requirements-completed: [STOR-06]

# Metrics
duration: 12min
completed: 2026-06-24
status: complete
human-verification-deferred: true
---

# Phase 01 Plan 01: Walking Skeleton Scaffold Summary

**Stands up the React 19.2 + Vite 7 + TypeScript (strict) static SPA with a GitHub Pages deploy pipeline and the Vitest + Playwright + fake-indexeddb test harness — the build/test/deploy backbone every other plan in the phase merges onto — and surfaces the blocking Google Cloud OAuth Client ID setup as a documented human prerequisite (SETUP.md).**

## Performance

- **Duration:** ~12 min (paused at the blocking human checkpoint; finalized by the orchestrator after the user chose to defer OAuth)
- **Completed:** 2026-06-24
- **Tasks:** 3 (2 code tasks + 1 human-prerequisite deliverable)
- **Files modified:** 20 created

## Accomplishments
- React 19.2 + Vite 7 + TypeScript (strict) static SPA scaffolded; `npm install` resolved 300 packages with no peer-dependency errors (react-konva 19.2.5 against react 19.2.7 + konva 10.3.0).
- `npx tsc --noEmit` exits 0 under `strict: true`; `npm run build` emits `dist/` with the `/relation_blueprint/` GitHub Pages base path applied to all asset references and exactly one GIS `<script>` tag.
- `npx vitest run` starts and exits 0 (`passWithNoTests`); fake-indexeddb is wired into `tests/setup.ts` so Dexie runs under the node/jsdom test environment.
- `.github/workflows/deploy.yml` builds and deploys the static bundle to GitHub Pages.
- `SETUP.md` documents the exact, security-reviewed Google Cloud OAuth Client ID steps (drive.file-only consent — T-01-01).
- No backend / prohibited dependencies present (verified: no express/firebase/supabase/fastify/tldraw/gapi/google-auth-library).

## Task Commits

1. **Task 1: Scaffold React 19.2 + Vite 7 + TS (strict) SPA + GitHub Pages deploy** - `b9d1dd6` (feat)
2. **Task 2: Vitest + Playwright + fake-indexeddb harness + fixtures dir** - `44be468` (feat)
3. **Task 3 (deliverable): SETUP.md documenting the OAuth prerequisite** - `414b2ff` (docs)

## Files Created/Modified
- `package.json` / `package-lock.json` - Pinned locked-stack dependency set + dev/test/build scripts.
- `vite.config.ts` - Vite config with the GitHub Pages `base: '/relation_blueprint/'` subpath (PWA plugin added later by Plan 08).
- `tsconfig.json` / `tsconfig.node.json` - TypeScript strict-mode project config.
- `index.html` - App shell + the Google Identity Services `<script>` tag.
- `.env.example` - `VITE_GOOGLE_CLIENT_ID` placeholder (public identifier, no secret).
- `eslint.config.js` / `.prettierrc` - Lint + format config (flat config).
- `.gitignore` - Excludes `dist/`, `node_modules/`, local `.env`, Playwright artifacts.
- `src/main.tsx` / `src/app/App.tsx` / `src/app/App.module.css` / `src/vite-env.d.ts` - Minimal app shell entry.
- `vitest.config.ts` / `playwright.config.ts` / `tests/setup.ts` / `tests/_fixtures/README.md` - Test harness (jsdom + fake-indexeddb; E2E config).
- `.github/workflows/deploy.yml` - GitHub Actions → GitHub Pages static deploy.
- `SETUP.md` - Blocking Google Cloud OAuth Client ID (drive.file) setup instructions.

## Decisions Made
- **ESLint flat config** (`eslint.config.js`) instead of the plan's `.eslintrc.cjs`: flat config is the ESLint 9 default the toolchain expects. Functionally equivalent; no scope change.
- **Added `package-lock.json` and `src/vite-env.d.ts`** (not enumerated in the plan's `files_modified`): the lockfile pins the locked stack reproducibly and the env shim is required for `import.meta.env` typing under strict mode.
- **OAuth Client ID deferred to phase-end verification:** the credential is only needed at runtime for live Drive connect (Plan 06). The user chose to keep building; the scaffold (this plan's actual code deliverable) is complete and committed. The OAuth setup is carried forward as a phase-end human-verification item (see below).

## Deviations from Plan
- `.eslintrc.cjs` → `eslint.config.js` (flat config) — toolchain-correct substitution.
- Added `package-lock.json` + `src/vite-env.d.ts` (supporting files the plan implied but did not list).
- **Checkpoint deferred, not resolved inline:** Plan 01-01 is `autonomous: false` with a `blocking-human` OAuth gate. Per the user's explicit "defer, keep building" decision, the orchestrator finalized the code deliverable and re-routed the human OAuth step to phase-end verification rather than blocking the remaining seven plans (all of which are testable against in-memory fakes and need no live credential).

## Issues Encountered
- None on the code path — `npm install`, `tsc --noEmit`, `vite build`, and `vitest run` all succeeded on first verification.

## Threat Model Coverage
- **T-01-01 (over-broad Drive consent):** documented mitigation — SETUP.md requires the OAuth consent screen to list ONLY `drive.file` and explicitly NOT "See and manage all of your Google Drive files." This is a **human-verification** item confirmed at phase end (the consent screen cannot be asserted from code).

## User Setup Required (DEFERRED — phase-end human-verification item)
**LIVE Google Drive connect requires a one-time human OAuth Client ID setup that is NOT yet done.** There is no `VITE_GOOGLE_CLIENT_ID` configured. Until it is, the Drive Connect UI (Plan 06) surfaces a clear "OAuth Client ID not configured — see SETUP.md" state; all code is unit/E2E-tested against mocked GIS, so nothing is blocked from building or testing.

Before this phase can be marked fully complete, the developer must (full detail in `SETUP.md`):
1. Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID (type: **Web application**).
2. Authorized JavaScript origins: `http://localhost:5173` and `https://<user>.github.io`.
3. OAuth consent screen: request **only** `https://www.googleapis.com/auth/drive.file`; **human-verify** the summary does NOT mention all Drive files (T-01-01); publish or add a test user.
4. Set `VITE_GOOGLE_CLIENT_ID=<id>` in a local `.env`.
5. Verify live connect: a real Google account connects, a visible "Relation Blueprint" folder appears in Drive, and the >1h token-expiry Reconnect flow works.

This is the primary item for `/gsd-verify-work`.

## Known Stubs
None — the scaffold is real and complete. The only outstanding item is the human OAuth setup above (a runtime prerequisite, not a code stub).

## Next Phase Readiness
- The build/test/deploy backbone is in place: strict TS, Vitest + Playwright + fake-indexeddb, and GitHub Pages deploy. Plans 02–08 built on it and all land green (tsc clean, 81 unit tests, 13 E2E, production build).
- The only gate to true phase completion is the deferred human OAuth verification above.

## Self-Check: PASSED

All 20 created files exist on disk; all 3 task commits (`b9d1dd6`, `44be468`, `414b2ff`) are present in git history. The code deliverable is complete; the OAuth human step is explicitly tracked as a phase-end verification item.

---
*Phase: 01-storage-spine-first-person-on-a-map*
*Completed: 2026-06-24 (OAuth human-verification deferred)*
