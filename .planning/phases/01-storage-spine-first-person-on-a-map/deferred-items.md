# Deferred Items — Phase 01

Out-of-scope discoveries logged during execution (NOT fixed here).

## 01-04
- **Pre-existing `react-hooks/set-state-in-effect` lint in `src/features/person-form/PersonForm.tsx`** (the open/reset effect calling `setState(initialState(person))`). Flagged identically at HEAD before 01-04; unrelated to the media slice. Repo-wide `eslint` has 260+ pre-existing problems and is not part of the green gate (`tsc + vite build` + Vitest + Playwright). Left untouched per executor scope boundary.
