---
status: resolved
trigger: "Map editor shape bugs: (1) polygons cannot be drawn, (2) shapes cannot be deleted, (3) shapes cannot be reshaped — pressing on a shape opens the style/edit panel instead of selecting it for reshape/transform."
created: 2026-08-20T00:00:00Z
updated: 2026-08-20T00:45:00Z
resolved_commit: 84dc0072b8e734cc08dc7fd2961c7bbbc0b682ce
---

## Current Focus

hypothesis: "All three symptoms are incomplete/incorrect wiring in the shape-interaction layer (MapView.tsx + StylePopover.tsx), NOT logic bugs deeper in the pure helpers. (1) polygon draw was never wired into the Stage pointer handlers; (2) no shape-delete affordance exists anywhere; (3) StylePopover is a MODAL Radix Dialog whose full-viewport overlay occludes the Transformer that DOES attach underneath."
test: "Read the full interaction path (handlePointerDown/Move/Up, onClick, ShapeNode.onSelect wiring, StylePopover modality). Cross-check with grep for any delete/keydown handler."
expecting: "Evidence shows polygon excluded from handlePointerDown, zero delete code, and a modal fullscreen overlay in StylePopover."
next_action: "Fixes applied + self-verified (typecheck, unit tests 16/16, production build, lint). Awaiting human verification on the deployed/preview build: (a) draw a polygon, (b) delete a selected shape, (c) reshape a shape via the Transformer while the (now non-modal) style panel is open. On 'confirmed fixed' → archive to resolved/ + commit + append knowledge-base."

reasoning_checkpoint:
  hypothesis: "The shape-interaction layer is incompletely/incorrectly wired in MapView.tsx and StylePopover.tsx. Polygon draw was deferred and never implemented; shape delete was never implemented; the styling panel is a modal dialog that visually blocks the Transformer that already attaches on shape-select."
  confirming_evidence:
    - "MapView.handlePointerDown line ~548: `if (tool !== 'rect' && tool !== 'ellipse' && tool !== 'line') return;` — polygon is explicitly excluded, with the comment 'polygon is multi-click — deferred to 03-04'. No addPolygonVertex/closePolygon call exists anywhere in MapView; those pure helpers in useToolMode are dead code from the consumer's side."
    - "Grep across src/features/person-map for delete|keydown|Backspace|removeShape|deleteShape finds ONLY layer-delete and portal-delete. There is no shape-delete: no keydown listener in MapView, and StylePopover has only preset/fill/label/layer controls + a Done button."
    - "StylePopover uses `<Dialog.Root open onOpenChange>` with NO modal prop (Radix default modal=true) and a `.overlay { position: fixed; inset: 0 }` full-viewport scrim + a center-screen `.content`. Modal Radix makes the rest of the document inert and the scrim covers the Stage, so the Transformer that MapView attaches (ShapeNode.onNodeRef → setSelectedNode → TransformerOverlay) is unreachable."
  falsification_test: "If polygon still cannot be drawn after wiring the vertex/close handlers, or if Delete does nothing after adding the handler+button, or if the Transformer handles remain unreachable after making the popover non-modal, the hypothesis is wrong."
  fix_rationale: "Each fix addresses the exact missing/incorrect wiring: (1) add the polygon click/close/cancel path that the pure helpers were built for; (2) add the delete affordance (keyboard + button) that never existed, routed through updateMapShapes(filter) + clearSelection; (3) convert the modal dialog to a non-modal, non-occluding, non-auto-closing popover so the already-attaching Transformer becomes usable. None of these change the pure geometry helpers, which are correct."
  blind_spots: "Have not run the deployed build interactively; verifying via unit-level reasoning + existing tests. Double-click-to-close adds coincident trailing vertices (harmless). Clicking an existing shape while in polygon mode may still select/drag it (pre-existing, out of scope). Marker deletion is intentionally out of scope (symptoms are shape-specific)."

## Symptoms

expected: (1) A polygon shape can be drawn on the map (click to add vertices, close/commit the polygon). (2) A selected shape can be deleted. (3) Clicking/pressing a shape selects it for reshape/transform (Konva Transformer or vertex handles), NOT immediately opening the style/edit panel.
actual: (1) Polygons cannot be drawn at all. (2) Shapes cannot be deleted. (3) Pressing a shape opens the style/edit panel instead of selecting it for reshape/transform — so reshape is unreachable.
errors: None reported in the browser console (silent failure — no crash, no red console errors). Confirmed: all three are missing/incorrect wiring, not runtime exceptions.
timeline: Latent/incomplete implementation (never worked). Symptom 1 carries a "deferred to 03-04" comment; symptoms 2 and 3 are missing/incorrect affordances.
reproduction: In the deployed (Cloudflare Pages) build, open the map editor: (a) select the polygon tool and attempt to draw a polygon; (b) select an existing shape and attempt to delete it; (c) click/press a shape and observe the style-edit panel opening rather than a selection/transform affordance.
environment: Deployed build (Cloudflare Pages production), not dev server.

## Resolution

root_cause: |
  Three independent gaps in the shape-interaction layer, all incomplete/incorrect wiring (no exceptions, hence silent):
  (1) POLYGON — MapView.handlePointerDown early-returns for every tool that is not rect/ellipse/line
      (`if (tool !== 'rect' && tool !== 'ellipse' && tool !== 'line') return;`). The polygon tool can be
      armed by the ToolPalette and correctly sets stageDraggable=false, but no handler ever calls
      beginDraw/addPolygonVertex/closePolygon, so a pointerdown does nothing. Polygon was deferred
      ("03-04") and never implemented in the consumer.
  (2) DELETE — There is no shape-delete anywhere: no keydown listener in MapView, and StylePopover
      exposes only preset/fill/label/layer + Done. A selected shape can never be removed.
  (3) RESHAPE UNREACHABLE — StylePopover is a MODAL Radix Dialog (no modal={false}) with a
      `position:fixed; inset:0` full-viewport overlay and a center-screen content box. On shape-select
      MapView DOES attach the Transformer (ShapeNode.onNodeRef → setSelectedNode → TransformerOverlay),
      but the modal makes the document inert and the scrim covers the Stage, so the handles are
      occluded/unreachable. The user perceives "the style panel opened instead of reshape handles".
fix: |
  (1) Wired polygon in MapView: handlePointerDown adds a vertex per click (beginDraw first, then
      addPolygonVertex); onDblClick/onDblTap and Enter close+commit via closePolygon; Escape cancels;
      handlePointerUp and the empty-canvas onClick now no-op while a polygon draft is in progress;
      DrawPreview renders the in-progress polygon as a rubber-band polyline.
  (2) Added shape delete: a MapView keydown handler (Delete/Backspace, ignored while typing in a form
      control) and a Delete button in StylePopover, both routed through a shared deleteShape callback
      that calls updateMapShapes(map.id, shapes => shapes.filter(s => s.id !== id)) + clearSelection().
  (3) Made StylePopover non-modal: Dialog.Root modal={false}, removed the blocking full-viewport
      overlay, prevented auto-close on outside/canvas interaction (onInteractOutside/onPointerDownOutside
      preventDefault), and docked the content to the bottom-left so the Transformer handles stay visible
      and reachable while styling.
verification: |
  Self-verified (automated + code-level):
    - `npm run typecheck` (tsc --noEmit) passes clean.
    - `npx vitest run tests/features/useToolMode.test.ts tests/features/shapes.test.ts` → 16/16 pass.
      The polygon pure helpers (beginDraw/addPolygonVertex/closePolygon) I newly wire are pinned by
      useToolMode.test.ts and match my usage exactly.
    - `npm run build` (the production/deployed bundle path where the bug lives) builds clean.
    - `eslint` on the two changed source files → 0 errors (only pre-existing warnings).
  Human gesture verification: WAIVED by explicit user decision. The user was shown the three live-gesture
  steps (polygon draw, shape delete, reshape via Transformer) and explicitly chose to SKIP live browser
  UAT and proceed to commit on the strength of the passing automated checks alone. Resolution is therefore
  based on automated checks only (typecheck clean, 16/16 unit tests, production build clean, eslint 0 errors).
  CAVEAT (pre-existing, unrelated to this fix): the Playwright e2e config carries a base-path drift
  (BASE_URL still /relation_blueprint/ while vite base moved to '/' in the Cloudflare migration), so the
  e2e suite is stale independent of this fix — it was not usable to auto-exercise the live gestures.
files_changed:
  - src/features/person-map/MapView.tsx (polygon wiring, keyboard delete + polygon Enter/Esc, dblclick close, deleteShape, onDelete prop, DrawPreview polygon branch)
  - src/features/person-map/editor/StylePopover.tsx (non-modal Dialog, no blocking overlay, prevent close-on-canvas-interaction, Delete button, onDelete prop)
  - src/features/person-map/editor/StylePopover.module.css (dock bottom-left, remove overlay scrim, .delete button style, .actions space-between)

## Eliminated

## Evidence

- timestamp: 2026-08-20T00:10:00Z
  checked: "MapView.tsx handlePointerDown (lines 529-555)"
  found: "Explicit `if (tool !== 'rect' && tool !== 'ellipse' && tool !== 'line') return;` with comment 'polygon is multi-click — deferred to 03-04'. No polygon branch; addPolygonVertex/closePolygon never called in MapView."
  implication: "Symptom 1 root cause: polygon draw path was never implemented in the consumer, though the pure helpers exist in useToolMode."

- timestamp: 2026-08-20T00:12:00Z
  checked: "grep delete|keydown|Backspace|removeShape|deleteShape across src/features/person-map"
  found: "Only deleteLayer (LayersPanel) and deleteMarker (portal cancel). No shape-delete, no window keydown handler in MapView. StylePopover controls = preset/fill/label/layer + Done only."
  implication: "Symptom 2 root cause: shape deletion is entirely unimplemented."

- timestamp: 2026-08-20T00:14:00Z
  checked: "StylePopover.tsx + StylePopover.module.css"
  found: "Dialog.Root has no modal prop (Radix default modal=true). .overlay is position:fixed; inset:0 full-viewport scrim; .content is center-screen. Meanwhile MapView wires the Transformer on shape-select via ShapeNode.onNodeRef → setSelectedNode → TransformerOverlay."
  implication: "Symptom 3 root cause: the Transformer DOES attach but the modal dialog + fullscreen overlay occlude it and make the Stage inert, so reshape handles are unreachable."

- timestamp: 2026-08-20T00:16:00Z
  checked: "Panel positions (MapView.module.css toolbar/bgHint, LayersPanel.module.css)"
  found: "Toolbar top-left, bgHint top-center, LayersPanel top-right. The bottom edge is free."
  implication: "A non-modal StylePopover can dock bottom-left without colliding with existing overlays."
