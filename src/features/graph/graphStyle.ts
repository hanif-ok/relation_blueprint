// graphStyle — the Cytoscape stylesheet for the relationship graph, driven ENTIRELY by the shared
// design tokens (UI-SPEC A5): every color reads from `@/app/tokens`, never an inline literal, so
// the graph can never drift from the canvas/DOM palette. Amber is reserved to selection + the ego
// node only (A8) — it is the one accent that appears here.
//
// Node/edge LABELS render as Cytoscape's own canvas text (`label: data(label)`) — never injected
// HTML — so a maliciously-named entity/relationship can never inject markup (T-04-01).
//
// Visual language (UI-SPEC § Graph content colors):
//   - person node: round (ellipse), paper border on the dark stage
//   - group node:  paper-shade round-rectangle (square-ish) to distinguish type at a glance (B8)
//   - edge:        translucent hairline; directed edges gain a triangle target arrow
//   - .ego / :selected: amber ring / amber line (the ONE reserved accent, A8)

import type cytoscape from 'cytoscape';
import { colors } from '@/app/tokens';

/** Compose an rgba() from a token hex so the edge hairline stays tied to the palette (no inline literal). */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Translucent hairline for edges — the `hairline` token at 55% alpha (UI-SPEC edge default). */
const EDGE_LINE = hexToRgba(colors.hairline, 0.55);

export const graphStyle: cytoscape.StylesheetJson = [
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      color: colors.paper,
      'font-size': 13,
      'text-valign': 'bottom',
      'text-margin-y': 4,
      width: 48,
      height: 48,
      'border-width': 2,
      'border-color': colors.paper,
      'background-color': colors.slate,
    },
  },
  {
    selector: 'node[kind="groups"]',
    style: {
      shape: 'round-rectangle',
      'background-color': colors.paperShade,
      'border-color': colors.paperShade,
      color: colors.paper,
    },
  },
  {
    selector: 'edge',
    style: {
      label: 'data(label)',
      width: 1.75,
      'line-color': EDGE_LINE,
      'font-size': 13,
      color: colors.inkMuted,
      'text-background-color': colors.slate,
      'text-background-opacity': 0.85,
      'text-background-padding': '2px',
    },
  },
  {
    selector: 'edge[?directed]',
    style: {
      'target-arrow-shape': 'triangle',
      'target-arrow-color': EDGE_LINE,
      'curve-style': 'bezier',
    },
  },
  {
    selector: 'node.ego',
    style: {
      'border-color': colors.amber,
      'border-width': 3,
    },
  },
  {
    selector: ':selected',
    style: {
      'border-color': colors.amber,
      'line-color': colors.amber,
      'target-arrow-color': colors.amber,
    },
  },
];
