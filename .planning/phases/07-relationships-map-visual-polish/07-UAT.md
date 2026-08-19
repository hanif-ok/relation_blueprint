---
status: testing
phase: 07-relationships-map-visual-polish
source: [07-VERIFICATION.md]
started: 2026-08-19T12:05:00Z
updated: 2026-08-19T12:05:00Z
---

## Current Test

number: 1
name: Light-background marker label legibility (auto dark halo)
expected: |
  Load a map with a light background image; keep or pick a light marker-label color.
  The label text reads clearly over the light background because the auto dark-slate
  halo separates it (closes the Phase-04 UAT white-on-white gap).
awaiting: user response

## Tests

### 1. Light-background marker label legibility (auto dark halo)
expected: Load a map with a light background image; keep or pick a light marker-label color; the label text is legible over the light background via the auto dark-slate halo (closes the Phase-04 UAT white-on-white gap).
result: [pending]

### 2. Dark-background marker label legibility (auto light halo)
expected: Load a map with a dark background image; pick a dark marker-label color; the label text is legible over the dark background via the auto light-paper halo.
result: [pending]

### 3. Connector casing contrast on light and dark backgrounds (WR-02 alpha)
expected: With a custom connector color set, screenshot the connector casing on both a light and a dark map background; the cased underlay keeps the connector line visible against both backgrounds, and the custom color renders at the same 0.55 resting alpha as the default hairline.
result: [pending]

### 4. Reduced-motion snap for ego focus and reset layout
expected: Enable OS-level prefers-reduced-motion; tap a graph node to enter ego focus, then click Reset layout; both the ego re-layout and the reset re-layout snap instantly with no animated tween.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
