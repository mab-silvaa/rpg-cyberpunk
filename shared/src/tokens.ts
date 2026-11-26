/** Token como o cliente o enxerga. Coordenadas em pixels da imagem; x e y são o centro. */
export interface TokenView {
  id: number;
  sceneId: number;
  name: string;
  x: number;
  y: number;
  /** Lado do token em quadrados do grid (0,5 a 10). */
  size: number;
  /** Cor de fundo e do aro, como #rrggbb. */
  color: string;
  imageUrl: string | null;
  /** Jogador que pode mover o token; null = só o mestre. */
  ownerId: number | null;
  /** Escondido dos jogadores. Quem não é mestre nunca recebe um token oculto. */
  hidden: boolean;
}

/** Campos que o mestre pode definir ao criar ou mudar um token. */
export interface TokenInput {
  sceneId?: number;
  name?: string;
  x?: number;
  y?: number;
  size?: number;
  color?: string;
  imageId?: number | null;
  ownerId?: number | null;
  hidden?: boolean;
}

/** Movimento de um token. `final` é true ao soltar: só aí o servidor grava a posição. */
export interface TokenMove {
  id: number;
  x: number;
  y: number;
  final: boolean;
}

export const TOKEN_NAME_MAX_LENGTH = 40;
export const TOKEN_SIZE_MIN = 0.5;
export const TOKEN_SIZE_MAX = 10;
export const TOKEN_DEFAULT_COLOR = "#f5e90a";
/** Eventos de arrasto por segundo, no máximo. */
export const TOKEN_MOVE_PER_SECOND = 20;

/**
 * Encaixa o centro do token no grid. Tokens de tamanho ímpar ficam no centro do quadrado;
 * de tamanho par, no cruzamento das linhas.
 */
export function snapToGrid(
  point: { x: number; y: number },
  size: number,
  gridPx: number,
): { x: number; y: number } {
  const offset = Math.ceil(size) % 2 === 1 ? gridPx / 2 : 0;
  const snap = (v: number): number => Math.round((v - offset) / gridPx) * gridPx + offset;
  return { x: snap(point.x), y: snap(point.y) };
}

/** Até duas iniciais do nome, para tokens sem imagem. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters =
    words.length === 1
      ? Array.from(words[0]!).slice(0, 2)
      : [Array.from(words[0]!)[0]!, Array.from(words[words.length - 1]!)[0]!];
  return letters.join("").toUpperCase();
}
