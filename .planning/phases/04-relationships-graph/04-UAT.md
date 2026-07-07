---
status: complete
phase: 04-relationships-graph
source: [04-01-SUMMARY.md, 04-02-SUMMARY.md, 04-03-SUMMARY.md, 04-04-SUMMARY.md]
started: 2026-07-03T12:52:57Z
updated: 2026-07-03T12:58:00Z
note: "Phase marked MVP mode but ROADMAP goal is not in strict user-story format; verifying via standard deliverable-based UAT ordered as a user flow (author -> map -> graph). Run /gsd mvp-phase 04 first if strict MVP framing is desired."
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Fresh restart — app boots with no console errors, IndexedDB opens through the version(5) upgrade, existing data loads intact.
result: pass

### 2. Relationships Section on a Profile
expected: Open a Person (or Group) profile. A "Relationships" section appears as a sibling of "Appears on", showing "No relationships yet." when empty. The section is NOT shown on a Location profile.
result: pass

### 3. Add a Relationship
expected: Click "+ Add relationship". A searchable picker lists only People and Groups (no Locations, and not the entity itself). Choose a direction (defaults to Mutual; picking Directed shows a "{This} → {Other}" preview), optionally fill label / date / notes, and save. The new relationship appears in the list.
result: pass

### 4. Link Appears on Both Endpoints
expected: Open the OTHER entity from the relationship you just created. The same relationship shows in its Relationships section too (one canonical link, visible from both sides), with the direction glyph reflecting the relationship. Clicking the nested endpoint button navigates to the linked entity.
result: pass

### 5. New Entity Menu Cleaned Up
expected: Open the "+ New" entity menu. There is NO standalone "+ Relationship-link" create item — only People, Location, and Group. (Relationships are authored from within a profile now.)
result: pass

### 6. Map Connectors Render
expected: On a map where two People who share a relationship are both placed, a connector line is drawn between their markers. It renders BENEATH the markers and does not block clicking or dragging the markers. Relationships involving a Group, or an unplaced person, do not draw a connector.
result: pass
note: "User confirmed pass; raised an out-of-scope enhancement about marker name-label color (see Out-of-Scope Notes)."

### 7. Directed Arrowhead + Live Drag-Follow
expected: A Directed relationship's connector shows an arrowhead pointing from → to; a Mutual one shows a plain line (no arrowhead). Dragging a connected marker makes the connector follow live/smoothly, and on release it settles cleanly between the two markers.
result: pass
note: "User confirmed pass; requested connector line color be customizable (see Out-of-Scope Notes)."

### 8. Relationship-Labels Toggle (Map)
expected: In the map's Layers panel, "Relationship labels" is OFF by default. Toggling it ON draws each connector's label text in a small pill at the midpoint of the line; toggling OFF hides them again.
result: pass

### 9. Graph View Opens
expected: A "Graph" entry (share/network icon) appears in the left nav. Clicking it opens a full-canvas relationship graph: People are round avatar nodes, Groups are square nodes, and relationships are edges (arrowhead when directed). With no relationships, it shows "No connections yet."
result: pass

### 10. Graph Interaction (Tap + Ego Highlight)
expected: Tapping a node in the graph opens that entity's profile. Opening the graph while a profile is open highlights that entity's node (amber "ego" ring) and centers on it. Edge labels are shown by default (toggle available). Nodes cannot be dragged in a way that changes data (viewer-only).
result: pass
note: "User confirmed pass; observed nodes cannot be dragged at all — this is by design (autoungrabify, viewer-only). Recorded as an enhancement candidate in Out-of-Scope Notes."

## Summary

total: 10
passed: 10
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]

## Out-of-Scope Notes

<!-- Enhancement ideas raised during UAT that are NOT phase-04 gaps; route to backlog/capture -->
- source_test: 6
  raised_by: user
  note: "Map marker name-label needs an option to change the label text color — white label text over a light/white background image is hard to read."
  relates_to: "Phase 03 map-editor Names toggle (D-20); marker name-label rendering, not Phase 04 relationship connectors."
  disposition: "Candidate for backlog / /gsd:capture as a map-editor legibility enhancement."
- source_test: 7
  raised_by: user
  note: "Connector line color should be user-customizable (currently a fixed warm hairline, amber when selected)."
  relates_to: "Phase 04 map connectors (ConnectorLayer); an enhancement, not a defect in delivered behavior."
  disposition: "Candidate for backlog / /gsd:capture as a connector styling enhancement (pairs with the label-color request above — a shared 'connector/label appearance' setting)."
- source_test: 10
  raised_by: user
  note: "Graph nodes cannot be dragged at all. Current behavior is intentional (autoungrabify → viewer-only, no data mutation). Possible enhancement: allow repositioning nodes for layout without persisting/mutating data."
  relates_to: "Phase 04 graph view (GraphView autoungrabify, D-12). Meets the viewer-only contract; enhancement not defect."
  disposition: "Candidate for backlog / /gsd:capture as a graph interactivity enhancement."
