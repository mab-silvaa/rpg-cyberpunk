/** Um termo da expressão: dados (com ! no d10 para o teste do RED) ou número fixo. */
export type DiceTerm =
  | { kind: "dice"; sign: 1 | -1; count: number; sides: number; test: boolean }
  | { kind: "number"; sign: 1 | -1; value: number };

export type ParsedDice =
  { ok: true; terms: DiceTerm[]; normalized: string } | { ok: false; error: string };

export const DICE_MAX_COUNT = 100;
export const DICE_MAX_SIDES = 1000;
export const DICE_MAX_TERMS = 20;
export const DICE_MAX_EXPRESSION_LENGTH = 100;
export const ROLL_LABEL_MAX_LENGTH = 60;

/**
 * Lê uma expressão como `2d6+3`, `1d10!+8` ou `d20-1+2d4`. O `!` num d10 pede o teste do Cyberpunk
 * RED: um 10 natural soma outro d10, um 1 natural subtrai outro d10.
 */
export function parseDice(input: string): ParsedDice {
  const text = input
    .trim()
    .toLowerCase()
    .replace(/\s*([+-])\s*/g, "$1");
  if (text.length === 0) return { ok: false, error: "Digite uma rolagem, como 1d10+8" };
  if (text.length > DICE_MAX_EXPRESSION_LENGTH) {
    return { ok: false, error: "Expressão longa demais" };
  }

  if (/\s/.test(text)) return { ok: false, error: "Espaço no meio de um termo: use 2d6+3" };

  const terms: DiceTerm[] = [];
  const pattern = /([+-]?)(\d*d\d+!?|\d+)/gy;
  let position = 0;
  while (position < text.length) {
    pattern.lastIndex = position;
    const match = pattern.exec(text);
    // Só o primeiro termo pode vir sem sinal.
    if (!match || (position > 0 && match[1] === "")) {
      return { ok: false, error: `Não entendi a rolagem perto de "${text.slice(position)}"` };
    }
    position = pattern.lastIndex;
    const sign: 1 | -1 = match[1] === "-" ? -1 : 1;
    const body = match[2]!;
    if (body.includes("d")) {
      const test = body.endsWith("!");
      const [countText, sidesText] = body.replace("!", "").split("d") as [string, string];
      const count = countText === "" ? 1 : Number(countText);
      const sides = Number(sidesText);
      if (count < 1 || count > DICE_MAX_COUNT) {
        return { ok: false, error: `Use de 1 a ${DICE_MAX_COUNT} dados por termo` };
      }
      if (sides < 2 || sides > DICE_MAX_SIDES) {
        return { ok: false, error: `Os dados têm de 2 a ${DICE_MAX_SIDES} lados` };
      }
      if (test && (sides !== 10 || count !== 1)) {
        return { ok: false, error: "O ! vale só para um d10 (1d10!)" };
      }
      terms.push({ kind: "dice", sign, count, sides, test });
    } else {
      const value = Number(body);
      if (!Number.isSafeInteger(value) || value > 100_000) {
        return { ok: false, error: "Número grande demais" };
      }
      terms.push({ kind: "number", sign, value });
    }
    if (terms.length > DICE_MAX_TERMS) {
      return { ok: false, error: `No máximo ${DICE_MAX_TERMS} termos` };
    }
  }
  if (!terms.some((t) => t.kind === "dice")) {
    return { ok: false, error: "A rolagem precisa de pelo menos um dado, como 1d10" };
  }
  return { ok: true, terms, normalized: formatTerms(terms) };
}

export function formatTerms(terms: DiceTerm[]): string {
  return terms
    .map((t, i) => {
      const sign = t.sign === -1 ? "-" : i === 0 ? "" : "+";
      return t.kind === "number"
        ? `${sign}${t.value}`
        : `${sign}${t.count}d${t.sides}${t.test ? "!" : ""}`;
    })
    .join("");
}

/** Resultado de um termo. Em "dice", `rolls` são os dados como caíram. */
export type TermResult =
  | {
      kind: "dice";
      sign: 1 | -1;
      count: number;
      sides: number;
      test: boolean;
      rolls: number[];
      /** Só no teste: o 10 natural explodiu (soma outro d10) ou o 1 natural falhou (subtrai). */
      testEffect?: "explode" | "fumble";
      /** Contribuição do termo, já com o sinal. */
      subtotal: number;
    }
  | { kind: "number"; sign: 1 | -1; value: number; subtotal: number };

export interface DiceOutcome {
  terms: TermResult[];
  total: number;
  /** Dano: dois ou mais 6 num grupo de d6 (ferimento crítico no RED). */
  critical: boolean;
}

/** Rola uma expressão já lida. `randomInt(max)` devolve um inteiro de 1 a max. */
export function rollTerms(terms: DiceTerm[], randomInt: (max: number) => number): DiceOutcome {
  let total = 0;
  let critical = false;
  const results: TermResult[] = terms.map((term) => {
    if (term.kind === "number") {
      const subtotal = term.sign * term.value;
      total += subtotal;
      return { ...term, subtotal };
    }
    const rolls = Array.from({ length: term.count }, () => randomInt(term.sides));
    let sum = rolls.reduce((a, b) => a + b, 0);
    let testEffect: "explode" | "fumble" | undefined;
    if (term.test) {
      const extra = rolls[0] === 10 ? 1 : rolls[0] === 1 ? -1 : 0;
      if (extra !== 0) {
        const bonus = randomInt(10);
        rolls.push(bonus);
        sum += extra * bonus;
        testEffect = extra === 1 ? "explode" : "fumble";
      }
    }
    if (term.sides === 6 && term.count >= 2 && rolls.filter((r) => r === 6).length >= 2) {
      critical = true;
    }
    const subtotal = term.sign * sum;
    total += subtotal;
    return { ...term, rolls, subtotal, ...(testEffect ? { testEffect } : {}) };
  });
  return { terms: results, total, critical };
}

/** Uma rolagem guardada no histórico da mesa. */
export interface RollResult extends DiceOutcome {
  id: number;
  userId: number;
  userName: string;
  expression: string;
  /** O que estava sendo rolado, por exemplo o nome da skill. */
  label: string | null;
  /** Só o mestre vê. */
  secret: boolean;
  at: string;
}

export interface RollRequest {
  expression: string;
  label?: string;
  secret?: boolean;
}

export type RollReply = { ok: true; roll: RollResult } | { ok: false; error: string };
