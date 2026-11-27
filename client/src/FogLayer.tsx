import { useMemo } from "react";
import { Image as KonvaImage } from "react-konva";
import type { FogShape } from "@vtt/shared";

/** Lado máximo do bitmap da fog; mapas maiores são desenhados em menor resolução. */
const MAX_BITMAP_SIDE = 3072;

/** Fog do jogador: --bg a 100%, sem desfoque nas bordas. */
const FOG_PLAYER_COLOR = "#07080d";

/** Hachura do mestre: --gm entre 20% e 60%, a 45°. */
function hatchPattern(ctx: CanvasRenderingContext2D): CanvasPattern | string {
  const tile = document.createElement("canvas");
  tile.width = 8;
  tile.height = 8;
  const t = tile.getContext("2d");
  if (!t) return "rgba(255,79,168,0.4)";
  t.fillStyle = "rgba(255,79,168,0.2)";
  t.fillRect(0, 0, 8, 8);
  t.strokeStyle = "rgba(255,79,168,0.6)";
  t.lineWidth = 2;
  t.beginPath();
  for (const d of [-8, 0, 8]) {
    t.moveTo(d, 8 + 0);
    t.lineTo(d + 8, 0);
  }
  t.stroke();
  return ctx.createPattern(tile, "repeat") ?? "rgba(255,79,168,0.4)";
}

/** Desenha a fog num canvas fora da tela: tudo coberto, e cada forma revela ou cobre em ordem. */
export function drawFog(
  canvas: HTMLCanvasElement,
  shapes: FogShape[],
  map: { width: number; height: number },
  factor: number,
  /** Mestre: hachura magenta de 45° (vê através). Jogador: preto sólido do fundo. */
  hatch = false,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(factor, factor);
  const paint = hatch ? hatchPattern(ctx) : FOG_PLAYER_COLOR;
  ctx.fillStyle = paint;
  ctx.fillRect(0, 0, map.width, map.height);
  for (const shape of shapes) {
    ctx.globalCompositeOperation = shape.mode === "reveal" ? "destination-out" : "source-over";
    ctx.fillStyle = paint;
    ctx.strokeStyle = paint;
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
  /** O mestre vê a fog em hachura, para saber o que está escondido sem perder o mapa. */
  translucent: boolean;
}

export function FogLayer({ shapes, map, translucent }: Props) {
  const canvas = useMemo(() => {
    const factor = Math.min(1, MAX_BITMAP_SIDE / Math.max(map.width, map.height));
    const el = document.createElement("canvas");
    el.width = Math.max(1, Math.round(map.width * factor));
    el.height = Math.max(1, Math.round(map.height * factor));
    drawFog(el, shapes, map, factor, translucent);
    return el;
  }, [shapes, map, translucent]);

  return (
    <KonvaImage
      image={canvas}
      width={map.width}
      height={map.height}
      opacity={1}
      listening={false}
    />
  );
}
