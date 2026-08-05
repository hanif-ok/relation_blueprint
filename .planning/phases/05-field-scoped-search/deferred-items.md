# Phase 5 — Deferred / Out-of-Scope Items

Discovered during execution but NOT fixed (SCOPE BOUNDARY: only auto-fix issues directly caused by
the current task's changes).

## Pre-existing lint failures (unrelated files, present at base commit b5acd28)

`npm run lint` fails on files this plan (05-01) did not touch. Verified byte-identical to the base
commit via `git diff b5acd28 -- <file>` (empty diff). All files added/modified by 05-01 are
lint-clean (0 errors, 0 warnings).

| File | Rule | Note |
|------|------|------|
| src/features/profile/ProfileSidebar.tsx | react-hooks/set-state-in-effect, react-hooks/exhaustive-deps | Pre-existing (Phase 2/4 code) |
| src/features/pwa/usePersistentStorage.ts | no-useless-assignment | Pre-existing |
| src/features/pwa/InstallPrompt.tsx | react-refresh/only-export-components | Pre-existing |
| src/app/App.tsx (seed-active-map effects, ~lines 101/121) | react-hooks/set-state-in-effect | Pre-existing effects; NOT in 05-01's diff (verified) |

Recommendation: address in a dedicated lint-cleanup pass (own plan) — out of scope for the search
spine. 05-01's `npm run lint` acceptance criterion is met for the files it authored; the whole-repo
lint gate was already red at the phase base.
