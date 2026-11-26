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
  formatMeasure,
  measureLine,
  type RulerLine,
  type RulerState,
  type SceneView,
  type TokenMove,
  type TokenView,
} from "@vtt/shared";
import { TokenShape } from "./TokenShape";
import { useImage } from "./useImage";
import { fitView, zoomAt, type View } from "./view";

const DEFAULT_MAP = { width: 2000, height: 1400 };
const RULER_EMIT_INTERVAL_MS = 50;

type Tool = "mover" | "regua";

interface Props {
  scene: SceneView | null;
  /** Prévia do mestre: os jogadores não veem esta cena. */
  preview: boolean;
  rulers: RulerState[];
  isGm: boolean;
  selfId: number;
  /** Tokens da cena mostrada (já filtrados pelo que este usuário pode ver). */
  tokens: TokenView[];
  selectedTokenId: number | null;
  onSelectToken: (id: number | null) => void;
  onMoveToken: (move: TokenMove) => void;
  onRuler: (line: RulerLine | null) => void;
  onLeavePreview: () => void;
}

const rulerColor = (userId: number): string => `hsl(${(userId * 67) % 360} 85% 62%)`;

function RulerShape({
  line,
  scene,
  scale,
  color,
  prefix,
}: {
  line: RulerLine;
  scene: SceneView;
  scale: number;
  color: string;
  prefix?: string;
}) {
  const text = formatMeasure(measureLine(line, scene.gridPx, scene.metersPerSquare));
  return (
    <Group listening={false}>
      <Line
        points={[line.x1, line.y1, line.x2, line.y2]}
        stroke={color}
        strokeWidth={2}
        strokeScaleEnabled={false}
      />
      <Circle x={line.x1} y={line.y1} radius={4 / scale} fill={color} />
      <Circle x={line.x2} y={line.y2} radius={4 / scale} fill={color} />
      <Label
        x={(line.x1 + line.x2) / 2}
        y={(line.y1 + line.y2) / 2}
        scaleX={1 / scale}
        scaleY={1 / scale}
      >
        <Tag fill="rgba(11,13,20,0.85)" stroke={color} cornerRadius={4} />
        <Text
          text={prefix ? `${prefix}: ${text}` : text}
          fill="#e6e9f2"
          fontSize={13}
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
  selfId,
  tokens,
  selectedTokenId,
  onSelectToken,
  onMoveToken,
  onRuler,
  onLeavePreview,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [tool, setTool] = useState<Tool>("mover");
  const [mine, setMine] = useState<RulerLine | null>(null);
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
  }
  useEffect(() => {
    onRuler(null);
  }, [rulerKey, onRuler]);

  const pointer = (stage: Konva.Stage) => stage.getRelativePointerPosition();

  const startRuler = useCallback(
    (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (tool !== "regua") return;
      const p = pointer(event.target.getStage()!);
      if (!p) return;
      setMine({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
    },
    [tool],
  );

  const moveRuler = useCallback(
    (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
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
    [tool, mine, onRuler],
  );

  const endRuler = useCallback(() => {
    if (!mine) return;
    setMine(null);
    onRuler(null);
  }, [mine, onRuler]);

  if (!scene) {
    return (
      <div className="map-empty">
        {isGm
          ? "Nenhuma cena ativa. Crie uma cena no painel do mestre."
          : "Esperando o mestre abrir um mapa."}
      </div>
    );
  }

  const gridLines = (ctx: Konva.Context, shape: Konva.Shape) => {
    ctx.beginPath();
    for (let x = 0; x <= map.width; x += scene.gridPx) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, map.height);
    }
    for (let y = 0; y <= map.height; y += scene.gridPx) {
      ctx.moveTo(0, y);
      ctx.lineTo(map.width, y);
    }
    ctx.fillStrokeShape(shape);
  };

  return (
    <div className="map" ref={wrapRef} data-tool={tool}>
      {sized && (
        <Stage
          width={size.width}
          height={size.height}
          x={view.x}
          y={view.y}
          scaleX={view.scale}
          scaleY={view.scale}
          draggable={tool === "mover"}
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
            <Rect width={map.width} height={map.height} fill="#10131c" />
            {image && (
              <KonvaImage image={image} width={map.width} height={map.height} listening={false} />
            )}
            {scene.gridVisible && (
              <Shape
                sceneFunc={gridLines}
                stroke="rgba(255,255,255,0.28)"
                strokeWidth={1}
                strokeScaleEnabled={false}
                listening={false}
              />
            )}
            {[...tokens]
              .sort((a, b) => b.size - a.size || a.id - b.id)
              .map((token) => (
                <TokenShape
                  key={token.id}
                  token={token}
                  gridPx={scene.gridPx}
                  map={map}
                  scale={view.scale}
                  draggable={tool === "mover" && (isGm || token.ownerId === selfId)}
                  mine={token.ownerId === selfId}
                  selected={selectedTokenId === token.id}
                  onSelect={() => onSelectToken(token.id)}
                  onMove={onMoveToken}
                />
              ))}
            {rulers.map((r) => (
              <RulerShape
                key={r.userId}
                line={r}
                scene={scene}
                scale={view.scale}
                color={rulerColor(r.userId)}
                prefix={r.name}
              />
            ))}
            {mine && <RulerShape line={mine} scene={scene} scale={view.scale} color="#f5e90a" />}
          </Layer>
        </Stage>
      )}

      <div className="map-toolbar">
        <button className={tool === "mover" ? "on" : ""} onClick={() => setTool("mover")}>
          Mover
        </button>
        <button className={tool === "regua" ? "on" : ""} onClick={() => setTool("regua")}>
          Régua
        </button>
        <button onClick={() => setView(fitView(size, map))}>Ajustar</button>
      </div>
      <div className="map-caption">
        {scene.name} · {scene.metersPerSquare} m por quadrado
      </div>
      {preview && (
        <div className="map-preview" role="status">
          Prévia: os jogadores não veem esta cena.
          <button onClick={onLeavePreview}>Voltar à cena ativa</button>
        </div>
      )}
    </div>
  );
}
