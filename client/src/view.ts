export interface View {
  x: number;
  y: number;
  scale: number;
}

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 8;

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

/** Enquadra o mapa inteiro, centralizado, sem ampliar além de 1,5×. */
export function fitView(
  container: { width: number; height: number },
  map: { width: number; height: number },
): View {
  const scale = clamp(
    Math.min(container.width / map.width, container.height / map.height),
    MIN_SCALE,
    1.5,
  );
  return {
    scale,
    x: (container.width - map.width * scale) / 2,
    y: (container.height - map.height * scale) / 2,
  };
}

/** Zoom que mantém o ponto sob o cursor no mesmo lugar da tela. direction > 0 aproxima. */
export function zoomAt(view: View, pointer: { x: number; y: number }, direction: number): View {
  const scale = clamp(direction > 0 ? view.scale * 1.1 : view.scale / 1.1, MIN_SCALE, MAX_SCALE);
  const anchor = { x: (pointer.x - view.x) / view.scale, y: (pointer.y - view.y) / view.scale };
  return { scale, x: pointer.x - anchor.x * scale, y: pointer.y - anchor.y * scale };
}

/** Zoom por fator (pinça e passos do celular), mantendo o ponto fixo e respeitando os limites. */
export function zoomBy(
  view: View,
  pointer: { x: number; y: number },
  factor: number,
  min = MIN_SCALE,
  max = MAX_SCALE,
): View {
  const scale = clamp(view.scale * factor, min, max);
  const anchor = { x: (pointer.x - view.x) / view.scale, y: (pointer.y - view.y) / view.scale };
  return { scale, x: pointer.x - anchor.x * scale, y: pointer.y - anchor.y * scale };
}
