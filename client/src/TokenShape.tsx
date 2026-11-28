import { useRef, useState } from "react";
import type Konva from "konva";
import {
  Circle,
  Group,
  Image as KonvaImage,
  Label,
  Line,
  Rect,
  RegularPolygon,
  Tag,
  Text,
} from "react-konva";
import {
  initials,
  snapToGrid,
  TOKEN_MOVE_PER_SECOND,
  type TokenMove,
  type TokenView,
} from "@vtt/shared";
import { useImageState } from "./useImage";

const EMIT_INTERVAL_MS = 1000 / TOKEN_MOVE_PER_SECOND;

// Constantes do canvas, direto do sistema de design (prancha 03 · Mapa).
const BG = "#07080d";
const TEXT = "#e8ecf8";
const ACCENT = "#22e5ff";
const GM = "#ff4fa8";
const TURN = "#ffc61a";
const OK = "#3ddc97";
const DANGER = "#ff5c6c";
const SURFACE_3 = "#1c2234";
const TEXT_DIM = "#a3acc7";
const HOSTILE_RING_GAP = 4;
const RADIUS_PER_SQUARE = 0.42;
const MIN_RADIUS_PX = 11;
const MIN_TOUCH_PX = 44;

interface Props {
  token: TokenView;
  gridPx: number;
  map: { width: number; height: number };
  /** Escala atual do mapa, para o rótulo e as linhas manterem o tamanho na tela. */
  scale: number;
  /** Pode arrastar agora (dono ou mestre, com a ferramenta de mover). */
  draggable: boolean;
  /** É a vez deste token na iniciativa. */
  turn: boolean;
  selected: boolean;
  onSelect: () => void;
  onMove: (move: TokenMove) => void;
}

const hexPoints = (r: number): number[] =>
  Array.from({ length: 6 }, (_, i) => {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    return [r * Math.cos(a), r * Math.sin(a)];
  }).flat();

/** Jogador = círculo, NPC (sem dono) = hexágono; oculto = traço magenta. */
export function TokenShape({
  token,
  gridPx,
  map,
  scale,
  draggable,
  turn,
  selected,
  onSelect,
  onMove,
}: Props) {
  const { image, failed } = useImageState(token.imageUrl);
  const [hover, setHover] = useState(false);
  const lastEmit = useRef(0);
  const r = Math.max(token.size * gridPx * RADIUS_PER_SQUARE, MIN_RADIUS_PX / scale);
  const npc = token.ownerId === null;
  const px = 1 / scale;
  // Derrotado (prancha 16): hostil com HP zero cai sozinho, NPC aliado só pelo mestre; o servidor decide.
  const defeated = token.defeated;
  const canDrag = draggable && !defeated;

  // Recorta o centro quadrado da imagem, para ela preencher a forma sem esticar.
  const crop = image
    ? (() => {
        const side = Math.min(image.naturalWidth, image.naturalHeight);
        return {
          x: (image.naturalWidth - side) / 2,
          y: (image.naturalHeight - side) / 2,
          width: side,
          height: side,
        };
      })()
    : undefined;

  /** Posição do arrasto: encaixada no grid (Shift solta) e dentro do mapa. */
  function place(node: Konva.Node, shift: boolean): { x: number; y: number } {
    const raw = {
      x: Math.min(Math.max(node.x(), 0), map.width),
      y: Math.min(Math.max(node.y(), 0), map.height),
    };
    const pos = shift ? raw : snapToGrid(raw, token.size, gridPx);
    node.position(pos);
    return pos;
  }

  const body = npc ? (
    <RegularPolygon sides={6} radius={r} rotation={0} fill={defeated ? SURFACE_3 : token.color} />
  ) : (
    <Circle radius={r} fill={defeated ? SURFACE_3 : token.color} />
  );
  const outline = {
    stroke: token.hidden ? GM : defeated ? TEXT_DIM : failed ? TURN : BG,
    strokeWidth: 2 * px,
    dash: token.hidden
      ? [4 * px, 3 * px]
      : defeated
        ? [4 * px, 3 * px]
        : failed
          ? [5 * px, 3 * px]
          : undefined,
  };
  const ringR = r + HOSTILE_RING_GAP * px;
  const hexPts = hexPoints(r);

  return (
    <Group
      name="token"
      x={token.x}
      y={token.y}
      draggable={canDrag}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onSelect}
      onTap={onSelect}
      onDragStart={onSelect}
      onDragMove={(e) => {
        const shift = (e.evt as MouseEvent).shiftKey === true;
        const pos = place(e.target, shift);
        const now = Date.now();
        if (now - lastEmit.current >= EMIT_INTERVAL_MS) {
          lastEmit.current = now;
          onMove({ id: token.id, x: pos.x, y: pos.y, final: false });
        }
      }}
      onDragEnd={(e) => {
        const pos = place(e.target, (e.evt as MouseEvent).shiftKey === true);
        onMove({ id: token.id, x: pos.x, y: pos.y, final: true });
      }}
    >
      {/* Área de toque: no mínimo 44 px em volta do token */}
      <Circle radius={Math.max(r, MIN_TOUCH_PX / 2 / scale)} fill="rgba(0,0,0,0.001)" />
      {token.hostile && hover && canDrag && (
        <Circle
          radius={ringR + 4 * px}
          stroke={DANGER}
          strokeWidth={8 * px}
          opacity={0.35}
          listening={false}
        />
      )}
      {token.hostile && (
        <Circle
          radius={ringR}
          stroke={defeated ? TEXT_DIM : DANGER}
          strokeWidth={2 * px}
          dash={defeated ? [4 * px, 3 * px] : undefined}
          listening={false}
        />
      )}
      {turn && (
        <>
          <Circle radius={r + 8 * px} stroke={TURN} strokeWidth={3 * px} listening={false} />
          <Line
            points={[
              -7 * px,
              -(r + 8 * px) - 14 * px,
              7 * px,
              -(r + 8 * px) - 14 * px,
              0,
              -(r + 8 * px) - 5 * px,
            ]}
            closed
            fill={TURN}
            listening={false}
          />
        </>
      )}
      <Group opacity={token.hidden ? 0.35 : 1}>
        {body}
        {image && (
          <Group
            clipFunc={(ctx) => {
              if (npc) {
                ctx.moveTo(hexPts[0]!, hexPts[1]!);
                for (let i = 2; i < hexPts.length; i += 2) ctx.lineTo(hexPts[i]!, hexPts[i + 1]!);
                ctx.closePath();
              } else {
                ctx.arc(0, 0, r, 0, Math.PI * 2, false);
              }
            }}
          >
            <KonvaImage image={image} crop={crop} x={-r} y={-r} width={2 * r} height={2 * r} />
          </Group>
        )}
      </Group>
      {!image && !failed && !defeated && (
        <Text
          text={initials(token.name)}
          x={-r}
          y={-r}
          width={2 * r}
          height={2 * r}
          align="center"
          verticalAlign="middle"
          fontFamily="Chakra Petch, sans-serif"
          fontSize={r * 0.85}
          fontStyle="bold"
          fill={BG}
          opacity={token.hidden ? 0.6 : 1}
          listening={false}
        />
      )}
      {defeated && (
        <>
          <Line
            points={[-r * 0.45, -r * 0.45, r * 0.45, r * 0.45]}
            stroke={TEXT_DIM}
            strokeWidth={2 * px}
            listening={false}
          />
          <Line
            points={[r * 0.45, -r * 0.45, -r * 0.45, r * 0.45]}
            stroke={TEXT_DIM}
            strokeWidth={2 * px}
            listening={false}
          />
        </>
      )}
      {failed && (
        <>
          <Circle
            x={r * 0.7}
            y={-r * 0.7}
            radius={Math.max(6 * px, r * 0.3)}
            fill={TURN}
            listening={false}
          />
          <Text
            text="!"
            x={r * 0.7 - 6 * px}
            y={-r * 0.7 - 6 * px}
            width={12 * px}
            height={12 * px}
            align="center"
            verticalAlign="middle"
            fontFamily="Chakra Petch, sans-serif"
            fontStyle="bold"
            fontSize={11 * px}
            fill={BG}
            listening={false}
          />
        </>
      )}
      {npc ? (
        <Line points={hexPts} closed listening={false} {...outline} />
      ) : (
        <Circle radius={r} listening={false} {...outline} />
      )}
      {selected && <Corners r={(token.hostile ? ringR : r) + 4 * px} px={px} />}
      {token.hp && token.hp.max > 0 && (
        <HpBar hp={token.hp} width={Math.max(2 * r, 40 * px)} y={-r - 9 * px} scale={scale} />
      )}
      {scale >= 1 && (
        <Label
          x={0}
          y={(token.hostile ? ringR : r) + 4 * px}
          scaleX={px}
          scaleY={px}
          listening={false}
        >
          <Tag fill="rgba(7,8,13,0.85)" />
          <Text
            text={token.name}
            textDecoration={defeated ? "line-through" : ""}
            fontFamily="JetBrains Mono, monospace"
            fontStyle="600"
            fontSize={11}
            fill={TEXT}
            padding={3}
          />
        </Label>
      )}
    </Group>
  );
}

/** Seleção: quatro cantos de 7 px, 2 px, ciano. */
function Corners({ r, px }: { r: number; px: number }) {
  const len = 7 * px;
  const c = (sx: number, sy: number) => (
    <Line
      key={`${sx}${sy}`}
      points={[sx * r, sy * (r - len), sx * r, sy * r, sx * (r - len), sy * r]}
      stroke={ACCENT}
      strokeWidth={2 * px}
      listening={false}
    />
  );
  return (
    <>
      {c(-1, -1)}
      {c(1, -1)}
      {c(1, 1)}
      {c(-1, 1)}
    </>
  );
}

/** Barra de HP acima do token: verde, âmbar abaixo da metade, vermelha com HP zero. */
function HpBar({
  hp,
  width,
  y,
  scale,
}: {
  hp: { current: number; max: number };
  width: number;
  y: number;
  scale: number;
}) {
  const ratio = Math.min(1, Math.max(0, hp.current / hp.max));
  const color = hp.current <= 0 ? DANGER : ratio <= 0.5 ? TURN : OK;
  const height = 4 / scale;
  return (
    <Group listening={false} x={-width / 2} y={y}>
      <Rect width={width} height={height} fill={SURFACE_3} stroke={BG} strokeWidth={1 / scale} />
      <Rect width={width * ratio} height={height} fill={color} />
    </Group>
  );
}
