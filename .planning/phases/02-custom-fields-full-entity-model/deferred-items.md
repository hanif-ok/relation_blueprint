# Deferred Items — Phase 02

Out-of-scope discoveries logged during execution (not fixed — see SCOPE BOUNDARY).

## Pre-existing lint errors (eslint `react-hooks/set-state-in-effect`)

Found during plan 02-04 execution; these predate this plan (present at the wave base commit)
and are unrelated to the custom-field work. Not fixed to avoid touching pre-existing code.

- `src/features/entity-form/EntityForm.tsx` — `setState` called synchronously inside the
  reset-on-open `useEffect`. Pre-existing reset pattern (mirrors PersonForm).
- `src/features/profile/ProfileSidebar.tsx` — `setPhotoBlob(undefined)` called synchronously
  inside the avatar-load `useEffect`; plus several `react-hooks/exhaustive-deps` warnings.

Both files also carry `react-refresh/only-export-components` / `exhaustive-deps` warnings from
their original authoring. Recommend a dedicated lint-cleanup pass for the `features/*` effects.
