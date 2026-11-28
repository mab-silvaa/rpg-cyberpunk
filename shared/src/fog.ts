/** Forma de fog: um retângulo ou um traço de pincel, que revela ou cobre. Coordenadas em pixels do mapa. */
export type FogShape = { id: number; mode: FogMode } & (
  | { kind: "rect"; x: number; y: number; w: number; h: number }
  | {
      kind: "brush";
      /** Diâmetro do pincel. */
      size: number;
      /** x1, y1, x2, y2, ... */
      points: number[];
    }
);

export type FogMode = "reveal" | "cover";

/** Forma enviada pelo mestre; o servidor dá o id. */
export type FogShapeInput =
  | { kind: "rect"; mode: FogMode; x: number; y: number; w: number; h: number }
  | { kind: "brush"; mode: FogMode; size: number; points: number[] };

export interface FogState {
  sceneId: number;
  /** Com a fog desligada, nada fica coberto. */
  enabled: boolean;
  /** Em ordem: cada forma vale por cima das anteriores. Sem formas, tudo fica coberto. */
  shapes: FogShape[];
}

export const FOG_MAX_SHAPES = 2000;
export const FOG_MAX_BRUSH_POINTS = 1500;
export const FOG_BRUSH_MIN = 4;
export const FOG_BRUSH_MAX = 2000;

function distanceToSegmentSquared(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return (px - cx) ** 2 + (py - cy) ** 2;
}

export function shapeContains(shape: FogShape, x: number, y: number): boolean {
  if (shape.kind === "rect") {
    return x >= shape.x && x <= shape.x + shape.w && y >= shape.y && y <= shape.y + shape.h;
  }
  const radiusSquared = (shape.size / 2) ** 2;
  const { points } = shape;
  if (points.length === 2) {
    return (x - points[0]!) ** 2 + (y - points[1]!) ** 2 <= radiusSquared;
  }
  for (let i = 0; i + 3 < points.length; i += 2) {
    if (
      distanceToSegmentSquared(x, y, points[i]!, points[i + 1]!, points[i + 2]!, points[i + 3]!) <=
      radiusSquared
    ) {
      return true;
    }
  }
  return false;
}

/** O ponto está sob fog? Começa coberto; cada forma, em ordem, revela ou cobre o que toca. */
export function isFogged(fog: Pick<FogState, "enabled" | "shapes">, x: number, y: number): boolean {
  if (!fog.enabled) return false;
  let fogged = true;
  for (const shape of fog.shapes) {
    if (shapeContains(shape, x, y)) fogged = shape.mode === "cover";
  }
  return fogged;
}
