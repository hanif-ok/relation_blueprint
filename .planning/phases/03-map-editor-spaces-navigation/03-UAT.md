---
status: testing
phase: 03-map-editor-spaces-navigation
source: [03-VERIFICATION.md]
started: 2026-06-27T03:38:55Z
updated: 2026-06-27T03:38:55Z
---

## Current Test

number: 1
name: Map editor stays responsive with many markers
expected: |
  Open a map with 100+ markers (seed via testBridge), pan and zoom, observe render
  smoothness. No visible jank or dropped frames during pan/zoom at high marker counts.
  Viewport culling should keep off-screen markers unmounted.
awaiting: user response

## Tests

### 1. Map editor stays responsive (no jank) with many markers
expected: Open a map with 100+ markers (seed via testBridge), pan and zoom — no visible jank or dropped frames; off-screen markers stay culled.
result: [pending]

### 2. On-canvas marker resize/rotate persists across reload
expected: Click a marker to select it, drag a Transformer corner handle to resize and a rotation handle to rotate, then reload the page. Transformer handles appear on selection, pointer events resize/rotate the marker, and the new width/height/rotation survive the reload.
result: [pending]

### 3. Background image transform persists and keeps markers anchored
expected: Click "Edit background", drag the background image to reposition it and use Transformer handles to scale/rotate, then reload. Background Transformer handles appear and allow drag/scale/rotate, MapDoc.backgroundTransform persists after reload, and already-placed markers stay anchored to their physical (image-space) spot, not their screen position.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
