import { useMemo } from "react";
import { Image as KonvaImage } from "react-konva";
import type { FogShape } from "@vtt/shared";

/** Lado máximo do bitmap da fog; mapas maiores são desenhados em menor resolução. */
const MAX_BITMAP_SIDE = 3072;

/** Desenha a fog num canvas fora da tela: tudo coberto, e cada forma revela ou cobre em ordem. */
export function drawFog(
  canvas: HTMLCanvasElement,
  shapes: FogShape[],
  map: { width: number; height: number },
  factor: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(factor, factor);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, map.width, map.height);
  for (const shape of shapes) {
    ctx.globalCompositeOperation = shape.mode === "reveal" ? "destination-out" : "source-over";
    ctx.fillStyle = "#000";
    ctx.strokeStyle = "#000";
    if (shape.kind === "rect") {
      ctx.fillRect(shape.x, shape.y, shape.w, shape.h);
    } else {
      ctx.lineWidth = shape.size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(shape.points[0]!, shape.points[1]!);
      // Um ponto só vira um traço de comprimento zero, que o lineCap redondo transforma num círculo.
      if (shape.points.length === 2) ctx.lineTo(shape.points[0]!, shape.points[1]!);
      for (let i = 2; i + 1 < shape.points.length; i += 2) {
        ctx.lineTo(shape.points[i]!, shape.points[i + 1]!);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

interface Props {
  shapes: FogShape[];
  map: { width: number; height: number };
  /** O mestre vê a fog translúcida, para saber o que está escondido sem perder o mapa. */
  translucent: boolean;
}

export function FogLayer({ shapes, map, translucent }: Props) {
  const canvas = useMemo(() => {
    const factor = Math.min(1, MAX_BITMAP_SIDE / Math.max(map.width, map.height));
    const el = document.createElement("canvas");
    el.width = Math.max(1, Math.round(map.width * factor));
    el.height = Math.max(1, Math.round(map.height * factor));
    drawFog(el, shapes, map, factor);
    return el;
  }, [shapes, map]);

  return (
    <KonvaImage
      image={canvas}
      width={map.width}
      height={map.height}
      opacity={translucent ? 0.5 : 1}
      listening={false}
    />
  );
}
