export interface InitiativeEntry {
  id: number;
  name: string;
  /** Valor da iniciativa. Jogadores não recebem. */
  value: number | null;
  /** Escondida dos jogadores (por exemplo, um inimigo que ainda não apareceu). */
  hidden: boolean;
  tokenId: number | null;
}

/** Iniciativa já na ordem de jogo (maior valor primeiro; sem valor, no fim). */
export interface InitiativeView {
  /** 0 enquanto o combate não começou. */
  round: number;
  /** Entrada que está na vez. */
  activeId: number | null;
  entries: InitiativeEntry[];
}

export interface InitiativeEntryInput {
  name?: string;
  value?: number | null;
  hidden?: boolean;
  tokenId?: number | null;
}

export const INITIATIVE_NAME_MAX_LENGTH = 40;
export const INITIATIVE_MAX_ENTRIES = 60;
export const INITIATIVE_VALUE_LIMIT = 1000;
