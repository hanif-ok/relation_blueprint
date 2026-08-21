---
phase: quick-260821-nac
plan: 01
subsystem: person-map-editor
status: complete
tags: [map-editor, konva, pointer-events, selection, e2e]
requires:
  - src/features/person-map/coords.ts (imageToStage composition)
  - src/features/person-map/editor/useToolMode.ts (tool/gesture state machine)
provides:
  - middle-mouse-button Stage pan, independent of the armed tool
  - marquee (rubber-band) multi-selection on the Select tool
  - auto-return to the Select tool after a committed shape draw
  - src/features/person-map/editor/marquee.ts (pure hit-test module)
affects:
  - src/features/person-map/MapView.tsx
  - src/features/person-map/editor/useToolMode.ts
  - playwright.config.ts (e2e base path)
tech-stack:
  added: []
  patterns:
    - hand-rolled pointer gesture driven from WINDOW listeners, with an optional
      deriveStageDraggable flag suppressing Konva's own drag-and-drop for its duration
    - additive multi-selection state alongside (not replacing) the existing single-select path
    - DOM overlay in stage-container px for constant-weight canvas chrome at any zoom
key-files:
  created:
    - src/features/person-map/editor/marquee.ts
    - tests/features/marquee.test.ts
    - e2e/canvas-pan-marquee.spec.ts
  modified:
    - src/features/person-map/MapView.tsx
    - src/features/person-map/MapView.module.css
    - src/features/person-map/editor/useToolMode.ts
    - tests/features/useToolMode.test.ts
    - playwright.config.ts
decisions:
  - Middle pan is hand-rolled, not Konva drag-and-drop (D-1) — Konva's default dragButtons include
    the middle button, which would pan only in Select mode and double-pan there.
  - A middle press never cancels an in-progress draw (D-2) — panning mid-polygon is a real workflow.
  - The marquee is mouse-only (D-3) — touch/pen keep today's single-finger Select-mode pan.
  - Multi-selection is ADDITIVE (D-4) — the single-select path is untouched; 1 hit sets it, 2+
    populates a parallel marqueeSelection with no Transformer/StylePopover.
  - Hit-testing is data-driven, not Konva-node-driven (D-5) — marker node names collide under
    multi-placement and an e2e asserts an exact name.
  - Auto-return fires only on a NON-NULL commit (D-6) — a stray click never disarms the curator.
metrics:
  duration: ~55 min
  completed: 2026-08-21
actuals:
  tokens: 21000
  tasks: 3
  commits: 6
---

# Quick Task 260821-nac: Middle-Click Pan, Marquee Select, Auto-Return Summary

Three map-editor canvas gestures delivered together on the shared `MapView` Stage pointer-event
seam: middle-button pan under any tool, Select-tool rubber-band multi-selection backed by a new
pure `marquee.ts` hit-test module, and auto-return to Select after a shape commits.

## What Was Built

**Task 1 — middle-mouse pan** (`a412c7a` RED, `e9de5c7` GREEN)

`deriveStageDraggable` gained two OPTIONAL gesture flags, `middlePanning` and `marqueeActive`,
evaluated **first** — ahead of even the two-finger always-pans override — so a hand-rolled gesture
owns the Stage outright and Konva's own drag-and-drop can never double-pan alongside it. The hook
exposes `setMiddlePanning` / `setMarqueeActive` on the same transient-flag seam as
`setTwoFingerActive`.

`MapView.handlePointerDown` now routes on `e.evt.button` **before any tool branch**: button 1 calls
`preventDefault()` + `stage.stopDrag()`, records the press origin (client px) plus the Stage
position, and returns without touching the draw state (D-2). Any non-left button returns early, so
no tool ever sees a right-click. The pan itself runs on **window** `pointermove`/`pointerup`/
`pointercancel` listeners, which is what makes a release outside the canvas still end it; the cull
rect is recomputed on end. A native `mousedown`/`auxclick` listener on the root suppresses the
platform autoscroll widget (this must be the native mouse event — preventing the default on the
pointer event does not suppress the compatibility event).

Also fixed `playwright.config.ts`: `BASE_URL` still derived from the GitHub Pages subpath
`/relation_blueprint/` while `vite.config.ts` moved `BASE` to `/` for Cloudflare Pages (commit
`d2e7d9b`). With that mismatch `vite preview` 404s every navigation, so **no e2e in this repo could
run at all**. This was the task's stated precondition.

**Task 2 — marquee selection** (`5466271` RED, `2fc87f4` GREEN)

New pure module `src/features/person-map/editor/marquee.ts` — no React, no Konva — exporting
`Box`, `normalizeBox`, `boxesIntersect`, `shapeStageBox`, `markerStageBox`, `marqueeHits`. It
recomposes stored geometry with the exact `imageToStage` math `ShapeNode` renders with, so what can
be banded is what is drawn. Rotation is deliberately not applied (a rotated shape is tested by its
unrotated composed box).

In `MapView`, a band starts only on a Select-tool **left mouse** press whose `e.target` is the
Stage. That target test is what keeps a drag begun on a marker/portal/shape flowing to that object's
own drag handler, and the pointer-type test is what preserves single-finger touch panning. Moves
just track the second corner; hit-testing runs once, on release. Release rule (D-4): 0 hits clears,
exactly 1 hit sets the **existing** single-select state (so Transformer + StylePopover attach
through the path they already use), 2+ populates the additive `marqueeSelection` whose id `Set`s
simply widen the existing `selected` props on `ShapeNode`/`AvatarMarker`/`PortalGlyph` — those three
components are unmodified.

`deleteShape` became `deleteShapes(string[])`, removing a whole selection in ONE `updateMapShapes`
fresh-read filter. The band renders as a DOM overlay in stage-container px, so it stays a
constant-weight 1px dashed `var(--amber)` outline at any zoom.

**Task 3 — auto-return to Select** (`91c39b9`)

`handlePointerUp` and `handlePolygonClose` call `setTool('select')` only inside the non-null commit
branch, after `setDrawTracked(null)` so the mirrored `drawRef` is cleared through the tracked setter
before `setTool` runs its own internal draft reset. A degenerate drag or an Escape-cancelled polygon
leaves the drawing tool armed (D-6).

## Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npx eslint` on the 7 changed files | **0 errors** (6 warnings, all pre-existing `layers`/fast-refresh patterns) |
| `npx vitest run --no-file-parallelism` | **405 passed / 61 files** |
| `npx playwright test e2e/canvas-pan-marquee.spec.ts` | **3/3 passed** (pan, marquee+Delete, auto-return) |
| Canvas e2e regression set (7 specs) | 10 passed, 3 failed — all 3 pre-existing, see Deferred |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `e.evt` is absent on programmatically fired Konva events**

- **Found during:** plan-level verification (the canvas e2e regression set)
- **Issue:** Konva types `KonvaEventObject.evt` as non-optional, but an event raised in code
  (`node.fire('click', { target: node }, true)` — what several existing specs do) carries no native
  event. My new button-routing guards read `.button`/`.pointerType` off it unconditionally, throwing
  a TypeError that killed the whole handler chain. This regressed
  `e2e/draw-shapes.spec.ts:127` and `e2e/place-person.spec.ts:135`.
- **Fix:** all three reads are optional; an event with no native counterpart is treated as a plain
  left press, which is what a synthetic click stands in for.
- **Files modified:** `src/features/person-map/MapView.tsx`
- **Commit:** `bea3305`

**2. [Rule 3 - Blocking] `visibleMarkers` / `visiblePortals` relocated above the pointer handlers**

- **Found during:** Task 2
- **Issue:** `finishMarquee` needs the culled memos as its hit-test candidate list, but a
  `useCallback` dependency array is evaluated at **render** time — referencing a `const` declared
  further down the component would hit its temporal dead zone.
- **Fix:** moved both memos verbatim (no logic change) to just above `pointerToImage`, with a
  comment recording why they live there. A back-reference comment was left at the old site.
- **Files modified:** `src/features/person-map/MapView.tsx`
- **Commit:** `2fc87f4`

**3. [Rule 1 - Bug] `handlePointerMove` missing `setMarqueeTracked` dependency**

- **Found during:** Task 2 lint
- **Issue:** the handler began using `setMarqueeTracked` without listing it, risking a stale
  closure.
- **Fix:** added to the dependency array.
- **Commit:** `2fc87f4`

### Test-geometry correction (not a product change)

The first marquee e2e attempt failed with "element(s) not found" for the band. Instrumenting the
Stage showed it received **no pointer events at all**: the drag started at canvas-relative (40,40),
which sits under the floating editor toolbar column (map switcher + breadcrumb + tool palette, which
overlay the top-left out to roughly y=135; the LayersPanel docks 248px down the right edge). The
press went to that DOM node, never to the canvas. The gesture itself was correct — the test now
starts at (150,260) and seeds its shapes accordingly, with a comment recording the constraint.

## Threat Mitigations Applied

| Threat | Applied |
| --- | --- |
| T-QT-01 (tampering via marquee Delete) | Delete acts on SHAPES only; a band must exceed `MARQUEE_MIN_DRAG` (3px) before any selection is made; `marqueeHits` returns empty for a zero-extent band; removal is one `updateMapShapes` fresh-read filter; the typing-in-a-form-control suppression is unchanged. |
| T-QT-02 (DoS on pointer events) | Hit-testing runs only on release, never per `pointermove`; candidates are the already-culled `visibleMarkers`/`visiblePortals`. |
| T-QT-03 (corrupt geometry) | `boxesIntersect` returns false for any non-finite coordinate or extent; `marqueeHits` guards the band the same way. Unit-tested. |
| T-QT-04 (window listeners) | Accepted as designed: listeners mount only while a gesture flag is true, are removed in effect cleanup, and touch only the local Konva Stage. |

## Known Stubs

None.

## Deferred Issues

See `deferred-items.md` in this directory. In short:

1. **Markers never render on a map with no logical layers** — 3 e2e specs
   (`marker.spec.ts:63`, `marker.spec.ts:90`, `transform-marker.spec.ts:65`) fail because
   `createMap` yields an empty `layers` array and `orderObjectsForRender` drops any object whose
   layer cannot be resolved. **Verified pre-existing**: the same specs fail against the pre-change
   source at `c9fe3a3` with only the playwright base-path fix applied. Not caused by this task,
   and outside its scope.
2. Repo-wide lint debt (16 errors / 17 warnings) in files this task did not touch.

## Self-Check: PASSED

Created files verified present:

- `src/features/person-map/editor/marquee.ts` — FOUND
- `tests/features/marquee.test.ts` — FOUND
- `e2e/canvas-pan-marquee.spec.ts` — FOUND

Commits verified in `git log`: `a412c7a`, `e9de5c7`, `5466271`, `2fc87f4`, `91c39b9`, `bea3305` — all FOUND.
