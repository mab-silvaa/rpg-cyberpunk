import type { RulerLine } from "./index.js";

export interface Measure {
  squares: number;
  meters: number;
}

/** Distância em linha reta, em quadrados do grid e em metros. */
export function measureLine(line: RulerLine, gridPx: number, metersPerSquare: number): Measure {
  const pixels = Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
  const squares = pixels / gridPx;
  return { squares, meters: squares * metersPerSquare };
}

const formatNumber = (n: number): string => (Math.round(n * 10) / 10).toString().replace(".", ",");

/** Ex.: "3,5 quadrados · 7 m". */
export function formatMeasure({ squares, meters }: Measure): string {
  const unit = Math.round(squares * 10) / 10 === 1 ? "quadrado" : "quadrados";
  return `${formatNumber(squares)} ${unit} · ${formatNumber(meters)} m`;
}
