import { useRef } from "react";
import type Konva from "konva";
import { Circle, Group, Image as KonvaImage, Rect, Text } from "react-konva";
import {
  initials,
  snapToGrid,
  TOKEN_MOVE_PER_SECOND,
  type TokenMove,
  type TokenView,
} from "@vtt/shared";
import { useImage } from "./useImage";

const EMIT_INTERVAL_MS = 1000 / TOKEN_MOVE_PER_SECOND;

interface Props {
  token: TokenView;
  gridPx: number;
  map: { width: number; height: number };
  /** Escala atual do mapa, para o rótulo manter o tamanho na tela. */
  scale: number;
  /** Pode arrastar agora (dono ou mestre, com a ferramenta de mover). */
  draggable: boolean;
  mine: boolean;
  selected: boolean;
  onSelect: () => void;
  onMove: (move: TokenMove) => void;
}

export function TokenShape({
  token,
  gridPx,
  map,
  scale,
  draggable,
  mine,
  selected,
  onSelect,
  onMove,
}: Props) {
  const image = useImage(token.imageUrl);
  const lastEmit = useRef(0);
  const r = (token.size * gridPx) / 2;

  // Recorta o centro quadrado da imagem, para ela preencher o círculo sem esticar.
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

  return (
    <Group
      name="token"
      x={token.x}
      y={token.y}
      draggable={draggable}
      opacity={token.hidden ? 0.5 : 1}
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
      <Circle radius={r} fill={token.color} />
      {image ? (
        <Group
          clipFunc={(ctx) => {
            ctx.arc(0, 0, r, 0, Math.PI * 2, false);
          }}
        >
          <KonvaImage image={image} crop={crop} x={-r} y={-r} width={2 * r} height={2 * r} />
        </Group>
      ) : (
        <Text
          text={initials(token.name)}
          x={-r}
          y={-r}
          width={2 * r}
          height={2 * r}
          align="center"
          verticalAlign="middle"
          fontSize={r * 0.8}
          fontStyle="bold"
          fill="#0b0d14"
          listening={false}
        />
      )}
      <Circle
        radius={r}
        stroke={selected ? "#ffffff" : mine ? "#f5e90a" : token.color}
        strokeWidth={selected ? 4 : mine ? 3 : 2}
        strokeScaleEnabled={false}
        dash={token.hidden ? [8, 6] : undefined}
      />
      {token.hp && token.hp.max > 0 && (
        <HpBar hp={token.hp} width={Math.max(2 * r, 40 / scale)} y={-r - 9 / scale} scale={scale} />
      )}
      <Text
        text={token.name}
        width={200}
        offsetX={100}
        y={r + 3 / scale}
        scaleX={1 / scale}
        scaleY={1 / scale}
        align="center"
        fontSize={12}
        fill="#e6e9f2"
        shadowColor="#000"
        shadowBlur={4}
        shadowOpacity={1}
        listening={false}
      />
    </Group>
  );
}

/** Barra de HP acima do token: verde, amarela abaixo da metade, vermelha com HP zero. */
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
  const color = hp.current <= 0 ? "#ff5c7a" : ratio <= 0.5 ? "#f5c542" : "#37d67a";
  const height = 6 / scale;
  return (
    <Group listening={false} x={-width / 2} y={y}>
      <Rect width={width} height={height} fill="#0b0d14" stroke="#000" strokeWidth={1 / scale} />
      <Rect width={width * ratio} height={height} fill={color} />
    </Group>
  );
}
