# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## map-editor-shape-bugs — silent shape-interaction-layer gaps (unwired polygon draw, missing delete affordance, modal StylePopover occluding the Transformer)
- **Date:** 2026-08-20
- **Error patterns:** polygon cannot be drawn, shape cannot be deleted, shape cannot be reshaped, pressing shape opens style panel instead of selecting, Transformer unreachable, silent failure no console error, missing wiring, modal Radix Dialog overlay, handlePointerDown early-return
- **Root cause:** Three independent, silent (no-exception) gaps in the shape-interaction layer of MapView.tsx + StylePopover.tsx. (1) Polygon draw was never wired: handlePointerDown early-returned for every tool that wasn't rect/ellipse/line, so beginDraw/addPolygonVertex/closePolygon (pure helpers in useToolMode) were never called from the consumer. (2) Shape delete never existed: no keydown listener and no delete control anywhere. (3) Reshape was unreachable because StylePopover was a MODAL Radix Dialog (modal defaults true) with a position:fixed inset:0 full-viewport scrim — the Transformer DID attach on shape-select but the modal made the Stage inert and the scrim occluded the handles, so the user perceived "the style panel opened instead of reshape handles."
- **Fix:** (1) Wired the polygon path in MapView (click adds vertex via beginDraw then addPolygonVertex; dblclick/Enter closes+commits via closePolygon; Escape cancels; DrawPreview renders an in-progress rubber-band polyline; pointerup/empty-canvas-click no-op during a draft). (2) Added a shared deleteShape callback (updateMapShapes filter + clearSelection) reached via a MapView Delete/Backspace keydown handler (ignored while typing in form controls) and a Delete button in StylePopover. (3) Made StylePopover non-modal (modal={false}), removed the blocking overlay scrim, prevented auto-close on outside/canvas interaction, and docked content bottom-left so the Transformer handles stay visible and reachable. Pure geometry helpers were correct and left unchanged.
- **Files changed:** src/features/person-map/MapView.tsx, src/features/person-map/editor/StylePopover.tsx, src/features/person-map/editor/StylePopover.module.css
---

