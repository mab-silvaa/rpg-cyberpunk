import { describe, expect, it } from "vitest";
import { formatMeasure, measureLine } from "@vtt/shared";

describe("régua", () => {
  it("mede em quadrados e metros pela distância em linha reta", () => {
    const m = measureLine({ x1: 0, y1: 0, x2: 140, y2: 0 }, 70, 2);
    expect(m).toEqual({ squares: 2, meters: 4 });
    const diagonal = measureLine({ x1: 0, y1: 0, x2: 3, y2: 4 }, 1, 1.5);
    expect(diagonal.squares).toBe(5);
    expect(diagonal.meters).toBe(7.5);
  });

  it("formata com vírgula e concorda o singular", () => {
    expect(formatMeasure({ squares: 3.46, meters: 6.92 })).toBe("3,5 quadrados · 6,9 m");
    expect(formatMeasure({ squares: 1, meters: 2 })).toBe("1 quadrado · 2 m");
    expect(formatMeasure({ squares: 0, meters: 0 })).toBe("0 quadrados · 0 m");
  });
});
