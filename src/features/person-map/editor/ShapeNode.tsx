// ShapeNode — renders ONE Shape descriptor (D-01) as the matching Konva primitive:
//   rect    → <Rect>
//   ellipse → <Ellipse>
//   line    → <Line>           (open polyline)
//   polygon → <Line closed>    (closed path)
//
// Geometry is stored in the background image's intrinsic IMAGE space and composed onto the live
// `MapDoc.backgroundTransform` at render time via `coords.imageToStage` (Pattern 7) — exactly like
// AvatarMarker — so a re-fit/resize/rotate of the background keeps the room where it was drawn.
// Stroke + (optional 20%) fill come from `tokens.zonePresets[shape.preset]` (never an inline hex).
//
// Drag-persist: the node is draggable; on drag-end its net stage-space delta is converted back to
// image space (stageToImage delta) and the shape's geometry is rewritten through `updateMap`
// (MapDoc.shapes) — NEVER straight to Dexie (RESEARCH anti-pattern; PATTERNS). A single click
// selects the shape (the consumer opens the StylePopover + Transformer).
//
// A non-empty label is rendered by the consumer as a sibling <ZoneLabel>; ShapeNode owns only the
// primitive + its selection outline.

import { useMemo } from 'react';
import { Rect, Ellipse, Line } from 'react-konva';
import type Konva from 'konva';
import { zonePresets, colors, marker as M } from '@/app/tokens';
import { updateMap } from '@/db/repository';
import type { BackgroundTransform, MapDoc, Shape } from '@/domain/types';
import { imageToStage, stageToImage } from '../coords';

/** Generous touch grab for thin Line shapes (UI-SPEC parity contract l.311). */
const LINE_HIT_STROKE = 20;
const STROKE_WIDTH = 2;

export interface ShapeNodeProps {
  /** The map this shape belongs to (needed to persist the whole shapes array on drag-end). */
  map: MapDoc;
  shape: Shape;
  /** The active background transform (image→stage composition). */
  transform: BackgroundTransform;
  selected: boolean;
  /** Single-click selects the shape (consumer opens the StylePopover). */
  onSelect: (shapeId: string) => void;
}

/** Resolve a preset id to its stroke/fill, defaulting to `stone` for an unknown preset. */
function presetColors(preset: string) {
  return zonePresets[preset as keyof typeof zonePresets] ?? zonePresets.stone;
}

/** Rewrite this shape inside the map's shapes array with a patch, then persist via updateMap. */
function persistShapePatch(map: MapDoc, shapeId: string, patch: Partial<Shape>): void {
  const shapes = map.shapes.map((s) => (s.id === shapeId ? { ...s, ...patch } : s));
  void updateMap(map.id, { shapes });
}

export function ShapeNode({ map, shape, transform, selected, onSelect }: ShapeNodeProps) {
  const { stroke, fill } = presetColors(shape.preset);
  const fillColor = shape.fill ? fill : undefined;
  const selectionStroke = selected ? colors.amber : stroke;
  const selectionWidth = selected ? M.ringSelectedWidth : STROKE_WIDTH;

  // Compose the shape's image-space points to stage space once per geometry/transform change.
  const stagePoints = useMemo(() => {
    if (!shape.points) return undefined;
    const out: number[] = [];
    for (let i = 0; i < shape.points.length; i += 2) {
      const p = imageToStage({ x: shape.points[i], y: shape.points[i + 1] }, transform);
      out.push(p.x, p.y);
    }
    return out;
  }, [shape.points, transform]);

  // Rect/ellipse origin composed to stage; size scaled by the (uniform) transform scale.
  const origin = useMemo(
    () => imageToStage({ x: shape.x ?? 0, y: shape.y ?? 0 }, transform),
    [shape.x, shape.y, transform],
  );
  const scaledW = (shape.width ?? 0) * transform.scale;
  const scaledH = (shape.height ?? 0) * transform.scale;
  const rotationDeg = ((transform.rotation + shape.rotation) * 180) / Math.PI;

  // On drag-end, convert the node's net stage-space delta back to IMAGE space and rewrite the
  // shape's geometry through updateMap. We diff the dropped origin against the pre-drag origin in
  // image space so rotation/scale are correctly undone (stageToImage is the exact inverse).
  function handleRectDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    const droppedImg = stageToImage({ x: e.target.x(), y: e.target.y() }, transform);
    persistShapePatch(map, shape.id, { x: droppedImg.x, y: droppedImg.y });
    // Reset the node's own offset — geometry now lives in the descriptor (re-render re-composes).
    e.target.position(origin);
  }

  function handlePointsDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    // A Line's drag moves the whole node by (dx,dy) in STAGE space. Convert that delta to image
    // space (delta = stageToImage(d) − stageToImage(0)) and shift every stored vertex.
    const dxStage = e.target.x();
    const dyStage = e.target.y();
    const zero = stageToImage({ x: 0, y: 0 }, transform);
    const moved = stageToImage({ x: dxStage, y: dyStage }, transform);
    const dImgX = moved.x - zero.x;
    const dImgY = moved.y - zero.y;
    const pts = shape.points ?? [];
    const shifted = pts.map((v, i) => (i % 2 === 0 ? v + dImgX : v + dImgY));
    persistShapePatch(map, shape.id, { points: shifted });
    e.target.position({ x: 0, y: 0 });
  }

  const commonHandlers = {
    draggable: true,
    onClick: () => onSelect(shape.id),
    onTap: () => onSelect(shape.id),
  } as const;

  if (shape.kind === 'rect') {
    return (
      <Rect
        x={origin.x}
        y={origin.y}
        width={scaledW}
        height={scaledH}
        rotation={rotationDeg}
        stroke={selectionStroke}
        strokeWidth={selectionWidth}
        fill={fillColor}
        name={`shape-${shape.id}`}
        onDragEnd={handleRectDragEnd}
        {...commonHandlers}
      />
    );
  }

  if (shape.kind === 'ellipse') {
    // Konva Ellipse is centered: place the center at origin + half-size (image-space box → center).
    const center = imageToStage(
      { x: (shape.x ?? 0) + (shape.width ?? 0) / 2, y: (shape.y ?? 0) + (shape.height ?? 0) / 2 },
      transform,
    );
    return (
      <Ellipse
        x={center.x}
        y={center.y}
        radiusX={scaledW / 2}
        radiusY={scaledH / 2}
        rotation={rotationDeg}
        stroke={selectionStroke}
        strokeWidth={selectionWidth}
        fill={fillColor}
        name={`shape-${shape.id}`}
        onDragEnd={(e) => {
          // Dropped center → back to image-space center → re-derive the box origin.
          const droppedImgCenter = stageToImage({ x: e.target.x(), y: e.target.y() }, transform);
          persistShapePatch(map, shape.id, {
            x: droppedImgCenter.x - (shape.width ?? 0) / 2,
            y: droppedImgCenter.y - (shape.height ?? 0) / 2,
          });
          e.target.position(center);
        }}
        {...commonHandlers}
      />
    );
  }

  // line (open) or polygon (closed)
  return (
    <Line
      points={stagePoints ?? []}
      closed={shape.kind === 'polygon'}
      stroke={selectionStroke}
      strokeWidth={selectionWidth}
      // Polygon gets the translucent fill when enabled; an open line is never filled.
      fill={shape.kind === 'polygon' ? fillColor : undefined}
      hitStrokeWidth={LINE_HIT_STROKE}
      lineCap="round"
      lineJoin="round"
      name={`shape-${shape.id}`}
      onDragEnd={handlePointsDragEnd}
      {...commonHandlers}
    />
  );
}
