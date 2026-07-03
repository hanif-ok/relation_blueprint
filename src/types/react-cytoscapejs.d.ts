// Ambient types for `react-cytoscapejs` (2.0.0). The package ships JS + a docgen json but NO
// TypeScript declarations, so `import CytoscapeComponent from 'react-cytoscapejs'` has no types
// and `tsc --noEmit` (strict) would fail. This declares the thin surface GraphView uses. Prop
// names mirror the component's runtime propTypes (dist/react-cytoscape.js). `global` is accepted
// at runtime (componentDidMount reads `props.global` to publish the core on window) even though
// it is absent from the shipped propTypes — GraphView uses it, e2e-gated, to expose the core.

declare module 'react-cytoscapejs' {
  import type { Component, CSSProperties } from 'react';
  import type cytoscape from 'cytoscape';

  export interface CytoscapeComponentProps {
    id?: string;
    className?: string;
    style?: CSSProperties;
    elements: cytoscape.ElementDefinition[];
    stylesheet?: cytoscape.StylesheetJson;
    layout?: { name: string } & Record<string, unknown>;
    cy?: (cy: cytoscape.Core) => void;
    /** Publishes the Cytoscape core on `window[global]` (used e2e-only to drive node taps). */
    global?: string;
    pan?: cytoscape.Position;
    zoom?: number;
    panningEnabled?: boolean;
    userPanningEnabled?: boolean;
    minZoom?: number;
    maxZoom?: number;
    zoomingEnabled?: boolean;
    userZoomingEnabled?: boolean;
    boxSelectionEnabled?: boolean;
    autoungrabify?: boolean;
    autolock?: boolean;
    autounselectify?: boolean;
    wheelSensitivity?: number;
    headless?: boolean;
    styleEnabled?: boolean;
    hideEdgesOnViewport?: boolean;
    textureOnViewport?: boolean;
    motionBlur?: boolean;
    motionBlurOpacity?: number;
    pixelRatio?: string | number;
  }

  export default class CytoscapeComponent extends Component<CytoscapeComponentProps> {
    /** Flattens a `{ nodes, edges }` shape to a single element array; passes an array through. */
    static normalizeElements(
      data:
        | cytoscape.ElementDefinition[]
        | { nodes?: cytoscape.ElementDefinition[]; edges?: cytoscape.ElementDefinition[] },
    ): cytoscape.ElementDefinition[];
  }
}
