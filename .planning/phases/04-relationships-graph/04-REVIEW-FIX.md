---
phase: 04-relationships-graph
fixed_at: 2026-07-03T12:27:02Z
review_path: .planning/phases/04-relationships-graph/04-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 4: Code Review Fix Report

**Fixed at:** 2026-07-03T12:27:02Z
**Source review:** .planning/phases/04-relationships-graph/04-REVIEW.md
**Iteration:** 1

> Note: this report is for the re-review dated 2026-07-03T12:15:00Z (WR-01..WR-03, IN-01..IN-02).
> The prior fix report for the first review cycle (BLOCKER + WR-01..WR-06) is preserved in git
> history at commit c7f2a94 ("docs(04): add code review fix report").

**Summary:**
- Findings in scope: 5 (fix_scope = all — includes Info findings)
- Fixed: 5
- Skipped: 0

All fixes were applied in an isolated git worktree and verified with a full-project
`tsc --noEmit` typecheck (exit 0) before each atomic commit.

## Fixed Issues

### WR-01: Graph ego effect resets pan/zoom on every unrelated data change

**Files modified:** `src/features/graph/GraphView.tsx`
**Commit:** dfa713d
**Applied fix:** Split the single ego effect into two. The amber-ring class toggle stays keyed on
`[egoId, elements]` (so the ring survives every re-render), while the `cy.animate({ center, zoom })`
call was moved into a separate effect keyed on `[egoId]` alone. The viewport now recenters only when
the ego target itself changes (graph opened from a specific entity, D-12) and no longer yanks back on
unrelated DB mutations, preserving the user's manual pan/zoom. Matches the reviewer's suggested split.

### WR-02: Connector hairline color hardcoded as an rgba literal instead of derived from the token

**Files modified:** `src/features/common/color.ts` (new), `src/features/graph/graphStyle.ts`, `src/features/person-map/editor/ConnectorLayer.tsx`
**Commit:** 46d983a
**Applied fix:** Extracted `hexToRgba` (previously a private function inside `graphStyle.ts`) into a
new shared util `@/features/common/color`. `graphStyle.ts` now imports it (behavior identical), and
`ConnectorLayer.tsx` replaces the hardcoded `'rgba(216,210,196,0.55)'` literal with
`hexToRgba(colors.hairline, 0.55)`. The on-canvas connectors and the graph edges now derive the same
hairline tint from the single palette token, so they can never drift. No test asserted the old
literal, so the whitespace difference in the composed string (`rgba(216, 210, 196, 0.55)`) is inert.
Chose the "shared util" option (over importing across features) for a cleaner dependency direction.

### WR-03: Connector label pill is not centered on the segment midpoint despite the comment

**Files modified:** `src/features/person-map/editor/ConnectorLayer.tsx`
**Commit:** 8e9e370
**Applied fix:** Replaced the inline `Label` (which carried a no-op `offsetX={0}` and a misleading
"centered" comment) with a small `ConnectorLabel` subcomponent. It holds a ref to the Konva `Label`,
measures the rendered pill via `getClientRect({ skipTransform: true })` after mount, and offsets the
`Label` by half its width/height so the pill is truly centered on the segment midpoint. Re-measures
when the label text changes.
**Note — requires human verification:** This changes on-canvas visual layout, which the `tsc`
typecheck cannot confirm. The code compiles and the logic is sound, but a developer should visually
confirm the label pill renders centered on the connector midpoint (toggle connector labels on in the
map editor) before treating this as done.

### IN-01: `initialsOf` duplicated across two components

**Files modified:** `src/features/common/initials.ts` (new), `src/features/profile/ProfileSidebar.tsx`, `src/features/person-map/AvatarMarker.tsx`, `src/features/browse/BrowseRow.tsx`, `src/features/person-map/editor/PersonPicker.tsx`
**Commit:** d285a0e
**Applied fix:** Extracted the single canonical `initialsOf` into a new shared util
`@/features/common/initials`. Removed the two independent implementations (the exported one in
`ProfileSidebar.tsx` and the private one in `AvatarMarker.tsx`) and pointed all call sites at the
shared util. Because `ProfileSidebar` no longer exports `initialsOf`, its two transitive importers
(`BrowseRow.tsx`, `PersonPicker.tsx`) were updated to import from the new util directly rather than
leaving a re-export shim. No tests imported the helper.

### IN-02: In-session graph position cache is never refreshed, so the preset fast-path is disabled until reopen

**Files modified:** `src/features/graph/GraphView.tsx`
**Commit:** 5ec3d1e
**Applied fix:** In the once-registered `layoutstop` handler, chained a `loadPositions()` +
`setPosCache({ probed: true, positions })` after `savePositions(cy)`. The in-memory React `posCache`
state now refreshes after every layout, so a subsequent same-node-set render re-enters the D-13
`preset` fast-path without requiring an app reopen. `setPosCache` is a stable state setter, safe to
call from the once-registered handler. The `layout` memo is keyed on `[usePreset]` (not on element
identity), so react-cytoscapejs re-applies the layout only when the preset/cose decision flips — the
refresh settles after one cycle without an infinite relayout loop.

---

_Fixed: 2026-07-03T12:27:02Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
