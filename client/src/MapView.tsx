import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type Konva from "konva";
import {
  Circle,
  Group,
  Image as KonvaImage,
  Label,
  Layer,
  Line,
  Rect,
  Shape,
  Stage,
  Tag,
  Text,
} from "react-konva";
import {
  FOG_BRUSH_MAX,
  FOG_BRUSH_MIN,
  FOG_MAX_BRUSH_POINTS,
  formatMeasure,
  measureLine,
  type FogMode,
  type FogShapeInput,
  type FogState,
  type RulerLine,
  type RulerState,
  type SceneView,
  type TokenMove,
  type TokenView,
} from "@vtt/shared";
import { FogLayer } from "./FogLayer";
import { TokenShape } from "./TokenShape";
import { useImage } from "./useImage";
import { fitView, zoomAt, type View } from "./view";
import { Icon, type IconName } from "./icons";
import { Button, ToolButton } from "./ui";

const DEFAULT_MAP = { width: 2000, height: 1400 };
const RULER_EMIT_INTERVAL_MS = 50;

type Tool = "mover" | "regua" | "ret-revelar" | "ret-cobrir" | "pincel-revelar" | "pincel-cobrir";

const FOG_TOOLS: { tool: Tool; label: string; icon: IconName }[] = [
  { tool: "ret-revelar", label: "Revelar com retângulo", icon: "eye" },
  { tool: "ret-cobrir", label: "Cobrir com retângulo", icon: "fog" },
  { tool: "pincel-revelar", label: "Revelar com pincel", icon: "brush" },
  { tool: "pincel-cobrir", label: "Cobrir com pincel", icon: "eyeoff" },
];

// Constantes do canvas, direto do sistema de design (prancha 03 · Mapa).
const BG = "#07080d";
const ACCENT = "#22e5ff";
const GM = "#ff4fa8";
const TEXT = "#e8ecf8";

const fogToolInfo = (tool: Tool): { kind: "rect" | "brush"; mode: FogMode } | null => {
  if (tool === "mover" || tool === "regua") return null;
  return {
    kind: tool.startsWith("ret") ? "rect" : "brush",
    mode: tool.endsWith("revelar") ? "reveal" : "cover",
  };
};

/** Forma de fog sendo desenhada pelo mestre, ainda não enviada. */
type Draft =
  | { kind: "rect"; mode: FogMode; x1: number; y1: number; x2: number; y2: number }
  | { kind: "brush"; mode: FogMode; points: number[] };

interface Props {
  scene: SceneView | null;
  /** Prévia do mestre: os jogadores não veem esta cena. */
  preview: boolean;
  rulers: RulerState[];
  isGm: boolean;
  selfId: number;
  /** Tokens da cena mostrada (já filtrados pelo que este usuário pode ver). */
  tokens: TokenView[];
  /** Fog da cena mostrada (null se a cena não tem). */
  fog: FogState | null;
  onFogShape: (shape: FogShapeInput) => void;
  selectedTokenId: number | null;
  onSelectToken: (id: number | null) => void;
  onMoveToken: (move: TokenMove) => void;
  onRuler: (line: RulerLine | null) => void;
  onLeavePreview: () => void;
  /** Token que está na vez da iniciativa. */
  turnTokenId?: number | null;
  /** Há faixa de iniciativa sobre o mapa (a prévia desce para não cobri-la). */
  hasInitiativeBar?: boolean;
  /** Celular: só olhar (arrastar, régua e fog ficam desligados). */
  viewOnly?: boolean;
}

function RulerShape({
  line,
  scene,
  scale,
  mine,
  prefix,
}: {
  line: RulerLine;
  scene: SceneView;
  scale: number;
  /** A sua régua tem brilho cheio; as dos outros ficam a 60%. */
  mine: boolean;
  prefix?: string;
}) {
  const text = formatMeasure(measureLine(line, scene.gridPx, scene.metersPerSquare));
  return (
    <Group listening={false} opacity={mine ? 1 : 0.6}>
      <Line
        points={[line.x1, line.y1, line.x2, line.y2]}
        stroke={ACCENT}
        strokeWidth={2}
        dash={[8, 6]}
        strokeScaleEnabled={false}
      />
      <Circle x={line.x1} y={line.y1} radius={4 / scale} fill={ACCENT} />
      <Circle x={line.x2} y={line.y2} radius={4 / scale} fill={ACCENT} />
      <Label
        x={(line.x1 + line.x2) / 2}
        y={(line.y1 + line.y2) / 2}
        scaleX={1 / scale}
        scaleY={1 / scale}
      >
        <Tag fill="rgba(7,8,13,0.85)" stroke={ACCENT} strokeWidth={1} />
        <Text
          text={prefix ? `${prefix}: ${text}` : text}
          fontFamily="JetBrains Mono, monospace"
          fontStyle="600"
          fill={TEXT}
          fontSize={12}
          padding={5}
        />
      </Label>
    </Group>
  );
}

export function MapView({
  scene,
  preview,
  rulers,
  isGm,
  viewOnly = false,
  selfId,
  tokens,
  fog,
  onFogShape,
  selectedTokenId,
  onSelectToken,
  onMoveToken,
  onRuler,
  onLeavePreview,
  turnTokenId = null,
  hasInitiativeBar = false,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [pickedTool, setTool] = useState<Tool>("mover");
  const tool: Tool = viewOnly ? "mover" : pickedTool;
  const [mine, setMine] = useState<RulerLine | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [brushPx, setBrushPx] = useState<number | null>(null);
  const lastEmit = useRef(0);

  const image = useImage(scene?.imageUrl ?? null);
  const map = {
    width: scene?.imageWidth ?? DEFAULT_MAP.width,
    height: scene?.imageHeight ?? DEFAULT_MAP.height,
  };

  // O contêiner só existe quando há cena; sem ela o componente mostra o aviso de mapa vazio.
  const hasScene = scene !== null;
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() =>
      setSize({ width: el.clientWidth, height: el.clientHeight }),
    );
    observer.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => observer.disconnect();
  }, [hasScene]);

  // Enquadra o mapa quando troca de cena ou quando a imagem muda de tamanho. Feito durante a
  // renderização (e não num efeito) para não piscar o mapa na posição antiga.
  const sceneKey = scene ? `${scene.id}:${map.width}x${map.height}` : "";
  const sized = size.width > 0 && size.height > 0;
  const fitKey = sized ? sceneKey : "";
  const [fittedKey, setFittedKey] = useState("");
  if (fitKey !== fittedKey) {
    setFittedKey(fitKey);
    if (fitKey) setView(fitView(size, map));
  }

  // Trocar de cena ou de ferramenta cancela uma régua em andamento.
  const rulerKey = `${sceneKey}|${tool}`;
  const [rulerKeyApplied, setRulerKeyApplied] = useState(rulerKey);
  if (rulerKey !== rulerKeyApplied) {
    setRulerKeyApplied(rulerKey);
    setMine(null);
    setDraft(null);
  }
  useEffect(() => {
    onRuler(null);
  }, [rulerKey, onRuler]);

  const pointer = (stage: Konva.Stage) => stage.getRelativePointerPosition();

  const fogOn = isGm && !viewOnly && fog?.enabled === true;
  const fogTool = fogOn ? fogToolInfo(tool) : null;
  const brushSize = Math.min(
    FOG_BRUSH_MAX,
    Math.max(FOG_BRUSH_MIN, brushPx ?? scene?.gridPx ?? 70),
  );

  // Mover: o mapa e os tokens arrastam. Com régua ou fog, o arrasto desenha.
  const panning = tool !== "regua" && !fogTool;

  const startRuler = useCallback(
    (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (fogTool) {
        const p = pointer(event.target.getStage()!);
        if (!p) return;
        setDraft(
          fogTool.kind === "rect"
            ? { kind: "rect", mode: fogTool.mode, x1: p.x, y1: p.y, x2: p.x, y2: p.y }
            : { kind: "brush", mode: fogTool.mode, points: [p.x, p.y] },
        );
        return;
      }
      if (tool !== "regua") return;
      const p = pointer(event.target.getStage()!);
      if (!p) return;
      setMine({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
    },
    [tool, fogTool],
  );

  const moveRuler = useCallback(
    (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (draft) {
        const p = pointer(event.target.getStage()!);
        if (!p) return;
        if (draft.kind === "rect") {
          setDraft({ ...draft, x2: p.x, y2: p.y });
        } else if (draft.points.length < FOG_MAX_BRUSH_POINTS * 2) {
          const n = draft.points.length;
          const dx = p.x - draft.points[n - 2]!;
          const dy = p.y - draft.points[n - 1]!;
          // Pontos muito próximos não mudam o traço; pular deixa a forma pequena.
          if (Math.hypot(dx, dy) * view.scale >= 3) {
            setDraft({ ...draft, points: [...draft.points, p.x, p.y] });
          }
        }
        return;
      }
      if (tool !== "regua" || !mine) return;
      const p = pointer(event.target.getStage()!);
      if (!p) return;
      const next = { ...mine, x2: p.x, y2: p.y };
      setMine(next);
      const now = Date.now();
      if (now - lastEmit.current >= RULER_EMIT_INTERVAL_MS) {
        lastEmit.current = now;
        onRuler(next);
      }
    },
    [tool, mine, onRuler, draft, view.scale],
  );

  const endRuler = useCallback(() => {
    if (draft) {
      setDraft(null);
      if (draft.kind === "rect") {
        const x = Math.min(draft.x1, draft.x2);
        const y = Math.min(draft.y1, draft.y2);
        const w = Math.abs(draft.x2 - draft.x1);
        const h = Math.abs(draft.y2 - draft.y1);
        // Um clique sem arrastar não cria uma forma de tamanho zero.
        if (w * view.scale >= 4 && h * view.scale >= 4) {
          onFogShape({ kind: "rect", mode: draft.mode, x, y, w, h });
        }
      } else {
        onFogShape({ kind: "brush", mode: draft.mode, size: brushSize, points: draft.points });
      }
      return;
    }
    if (!mine) return;
    setMine(null);
    onRuler(null);
  }, [mine, onRuler, draft, onFogShape, brushSize, view.scale]);

  if (!scene) {
    return (
      <div className="map-empty">
        <Icon name="map" size={32} />
        <strong>Nenhuma cena ativa</strong>
        <span>
          {isGm
            ? "Crie uma cena na aba Cena do painel e ative-a para os jogadores."
            : "Aguarde o mestre ativar uma cena."}
        </span>
      </div>
    );
  }

  // Grade: rgba(255,255,255,.07), e a cada 5 quadrados .16.
  const gridLines = (ctx: Konva.Context, shape: Konva.Shape, major: boolean) => {
    ctx.beginPath();
    for (let i = 0, x = 0; x <= map.width; i++, x += scene.gridPx) {
      if ((i % 5 === 0) !== major) continue;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, map.height);
    }
    for (let j = 0, y = 0; y <= map.height; j++, y += scene.gridPx) {
      if ((j % 5 === 0) !== major) continue;
      ctx.moveTo(0, y);
      ctx.lineTo(map.width, y);
    }
    ctx.fillStrokeShape(shape);
  };

  return (
    <div
      className="map"
      ref={wrapRef}
      data-tool={fogTool ? "fog" : tool === "regua" ? "regua" : "mover"}
    >
      {sized && (
        <Stage
          width={size.width}
          height={size.height}
          x={view.x}
          y={view.y}
          scaleX={view.scale}
          scaleY={view.scale}
          draggable={panning}
          onDragEnd={(e) => {
            if (e.target === e.target.getStage())
              setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
          }}
          onWheel={(e) => {
            e.evt.preventDefault();
            const stage = e.target.getStage()!;
            const p = stage.getPointerPosition();
            if (p) setView((v) => zoomAt(v, p, e.evt.deltaY < 0 ? 1 : -1));
          }}
          onClick={(e) => {
            if (!e.target.findAncestor(".token", true)) onSelectToken(null);
          }}
          onMouseDown={startRuler}
          onTouchStart={startRuler}
          onMouseMove={moveRuler}
          onTouchMove={moveRuler}
          onMouseUp={endRuler}
          onTouchEnd={endRuler}
          onMouseLeave={endRuler}
        >
          <Layer>
            <Rect width={map.width} height={map.height} fill={BG} />
            {image && (
              <KonvaImage image={image} width={map.width} height={map.height} listening={false} />
            )}
            {scene.gridVisible && (
              <>
                <Shape
                  sceneFunc={(ctx, shape) => gridLines(ctx, shape, false)}
                  stroke="rgba(255,255,255,0.07)"
                  strokeWidth={1}
                  strokeScaleEnabled={false}
                  listening={false}
                />
                <Shape
                  sceneFunc={(ctx, shape) => gridLines(ctx, shape, true)}
                  stroke="rgba(255,255,255,0.16)"
                  strokeWidth={1}
                  strokeScaleEnabled={false}
                  listening={false}
                />
              </>
            )}
            {fog?.enabled && <FogLayer shapes={fog.shapes} map={map} translucent={isGm} />}
            {[...tokens]
              .sort((a, b) => b.size - a.size || a.id - b.id)
              .map((token) => (
                <TokenShape
                  key={token.id}
                  token={token}
                  gridPx={scene.gridPx}
                  map={map}
                  scale={view.scale}
                  draggable={!viewOnly && panning && (isGm || token.ownerId === selfId)}
                  turn={turnTokenId === token.id}
                  selected={selectedTokenId === token.id}
                  onSelect={() => onSelectToken(token.id)}
                  onMove={onMoveToken}
                />
              ))}
            {draft?.kind === "rect" && (
              <Rect
                x={Math.min(draft.x1, draft.x2)}
                y={Math.min(draft.y1, draft.y2)}
                width={Math.abs(draft.x2 - draft.x1)}
                height={Math.abs(draft.y2 - draft.y1)}
                fill={draft.mode === "reveal" ? "rgba(34,229,255,0.25)" : "rgba(255,79,168,0.3)"}
                stroke={draft.mode === "reveal" ? ACCENT : GM}
                strokeWidth={1.5}
                strokeScaleEnabled={false}
                dash={[6, 4]}
                listening={false}
              />
            )}
            {draft?.kind === "brush" && (
              <Line
                points={
                  draft.points.length === 2 ? [...draft.points, ...draft.points] : draft.points
                }
                stroke={draft.mode === "reveal" ? "rgba(34,229,255,0.35)" : "rgba(255,79,168,0.4)"}
                strokeWidth={brushSize}
                lineCap="round"
                lineJoin="round"
                listening={false}
              />
            )}
            {rulers.map((r) => (
              <RulerShape
                key={r.userId}
                line={r}
                scene={scene}
                scale={view.scale}
                mine={false}
                prefix={r.name}
              />
            ))}
            {mine && <RulerShape line={mine} scene={scene} scale={view.scale} mine />}
          </Layer>
        </Stage>
      )}

      {!viewOnly && (
        <div className="float map-tools" role="toolbar" aria-label="Ferramentas do mapa">
          <div className="float-in">
            <ToolButton
              icon="move"
              label="Mover"
              pressed={tool === "mover"}
              onClick={() => setTool("mover")}
            />
            <ToolButton
              icon="ruler"
              label="Régua"
              pressed={tool === "regua"}
              onClick={() => setTool("regua")}
            />
            {fogOn && (
              <>
                <hr />
                {FOG_TOOLS.map(({ tool: t, label, icon }) => (
                  <ToolButton
                    key={t}
                    gm
                    icon={icon}
                    label={label}
                    pressed={tool === t}
                    onClick={() => setTool(t)}
                  />
                ))}
                <div className="brush">
                  <input
                    type="number"
                    aria-label="Tamanho do pincel (px)"
                    title="Tamanho do pincel (px)"
                    min={FOG_BRUSH_MIN}
                    max={FOG_BRUSH_MAX}
                    value={brushSize}
                    onChange={(e) => setBrushPx(Number(e.target.value))}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {viewOnly ? (
        <div className="float map-view-only" style={{ left: 10, top: 10 }}>
          <div
            className="float-in"
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 8px", height: 24 }}
          >
            <Icon name="eye" size={14} />
            <span className="t-label">Só visualização</span>
          </div>
        </div>
      ) : null}
      <div className="map-zoom">
        {!viewOnly && (
          <ToolButton
            icon="minus"
            label="Afastar"
            onClick={() => setView((v) => zoomAt(v, { x: size.width / 2, y: size.height / 2 }, -1))}
          />
        )}
        {!viewOnly && <span>{Math.round(view.scale * 100)}%</span>}
        {!viewOnly && (
          <ToolButton
            icon="plus"
            label="Aproximar"
            onClick={() => setView((v) => zoomAt(v, { x: size.width / 2, y: size.height / 2 }, 1))}
          />
        )}
        <ToolButton icon="fit" label="Ajustar" onClick={() => setView(fitView(size, map))} />
      </div>
      {preview && (
        <div className={`map-preview ${hasInitiativeBar ? "has-init" : ""}`} role="status">
          <Icon name="eye" size={16} color={GM} />
          Prévia: os jogadores não veem esta cena
          <Button size="sm" onClick={onLeavePreview}>
            Voltar à cena ativa
          </Button>
        </div>
      )}
    </div>
  );
}
