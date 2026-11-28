export const STAT_KEYS = [
  "INT",
  "REF",
  "DEX",
  "TECH",
  "COOL",
  "WILL",
  "LUCK",
  "MOVE",
  "BODY",
  "EMP",
] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export interface SkillEntry {
  name: string;
  stat: StatKey;
  level: number;
}

export interface WeaponEntry {
  name: string;
  /** Nome da skill usada no ataque (ou vazio). */
  skill: string;
  /** Expressão de dano, como 3d6. */
  damage: string;
  rof: number;
  ammo: number;
  ammoMax: number;
  notes: string;
}

export interface CyberwareEntry {
  name: string;
  /** Humanity que o implante custou. */
  humanityLoss: number;
  notes: string;
}

export interface GearEntry {
  name: string;
  qty: number;
  notes: string;
}

/** Ficha de personagem do Cyberpunk RED. Só nomes, números e o que o jogador escreve. */
export interface CharacterData {
  handle: string;
  role: string;
  rank: number;
  stats: Record<StatKey, number>;
  skills: SkillEntry[];
  hpCurrent: number;
  humanityCurrent: number;
  luckCurrent: number;
  headSp: number;
  headSpMax: number;
  bodySp: number;
  bodySpMax: number;
  weapons: WeaponEntry[];
  cyberware: CyberwareEntry[];
  gear: GearEntry[];
  eddies: number;
  lifepath: string;
  notes: string;
}

export interface CharacterView {
  id: number;
  /** Jogador dono da ficha; null para fichas do mestre (NPCs). */
  ownerId: number | null;
  data: CharacterData;
  updatedAt: string;
}

export const CHARACTER_LIMITS = {
  skills: 120,
  weapons: 30,
  cyberware: 60,
  gear: 100,
  textShort: 80,
  textLong: 4000,
  stat: 20,
  skillLevel: 10,
  hp: 999,
} as const;

/** Skills do jogo e o STAT de cada uma. Os jogadores podem editar, apagar e acrescentar. */
export const DEFAULT_SKILLS: SkillEntry[] = (
  [
    ["Concentration", "WILL"],
    ["Conceal/Reveal Object", "INT"],
    ["Lip Reading", "INT"],
    ["Perception", "INT"],
    ["Tracking", "INT"],
    ["Athletics", "DEX"],
    ["Contortionist", "DEX"],
    ["Dance", "DEX"],
    ["Endurance", "WILL"],
    ["Resist Torture/Drugs", "WILL"],
    ["Stealth", "DEX"],
    ["Drive Land Vehicle", "REF"],
    ["Pilot Air Vehicle", "REF"],
    ["Pilot Sea Vehicle", "REF"],
    ["Riding", "DEX"],
    ["Accounting", "INT"],
    ["Animal Handling", "INT"],
    ["Bureaucracy", "INT"],
    ["Business", "INT"],
    ["Composition", "INT"],
    ["Criminology", "INT"],
    ["Cryptography", "INT"],
    ["Deduction", "INT"],
    ["Education", "INT"],
    ["Gamble", "INT"],
    ["Library Search", "INT"],
    ["Local Expert", "INT"],
    ["Science", "INT"],
    ["Tactics", "INT"],
    ["Wilderness Survival", "INT"],
    ["Brawling", "DEX"],
    ["Evasion", "DEX"],
    ["Martial Arts", "DEX"],
    ["Acting", "COOL"],
    ["Play Instrument", "TECH"],
    ["Archery", "REF"],
    ["Autofire", "REF"],
    ["Handgun", "REF"],
    ["Heavy Weapons", "REF"],
    ["Shoulder Arms", "REF"],
    ["Melee Weapon", "DEX"],
    ["Bribery", "COOL"],
    ["Conversation", "EMP"],
    ["Human Perception", "EMP"],
    ["Interrogation", "COOL"],
    ["Persuasion", "COOL"],
    ["Personal Grooming", "COOL"],
    ["Streetwise", "COOL"],
    ["Trading", "COOL"],
    ["Wardrobe & Style", "COOL"],
    ["Air Vehicle Tech", "TECH"],
    ["Basic Tech", "TECH"],
    ["Cybertech", "TECH"],
    ["Demolitions", "TECH"],
    ["Electronics/Security Tech", "TECH"],
    ["First Aid", "TECH"],
    ["Forgery", "TECH"],
    ["Land Vehicle Tech", "TECH"],
    ["Paint/Draw/Sculpt", "TECH"],
    ["Paramedic", "TECH"],
    ["Photography/Film", "TECH"],
    ["Pick Lock", "TECH"],
    ["Pick Pocket", "DEX"],
    ["Sea Vehicle Tech", "TECH"],
    ["Weaponstech", "TECH"],
  ] as [string, StatKey][]
).map(([name, stat]) => ({ name, stat, level: 0 }));

const clampInt = (value: unknown, min: number, max: number, fallback = min): number => {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback;
  return Math.min(max, Math.max(min, n));
};

/** Corta o texto no limite e tira caracteres de controle (no texto longo, mantém quebra de linha e tab). */
const clean = (value: unknown, max: number, multiline = false): string => {
  if (typeof value !== "string") return "";
  const text = Array.from(value)
    .filter((ch) => {
      const code = ch.codePointAt(0)!;
      if (multiline && (code === 10 || code === 9)) return true;
      return !(code < 32 || (code >= 127 && code <= 159));
    })
    .join("");
  return text.slice(0, max);
};

const statKey = (value: unknown): StatKey =>
  (STAT_KEYS as readonly string[]).includes(value as string) ? (value as StatKey) : "INT";

const list = <T>(
  value: unknown,
  max: number,
  map: (item: Record<string, unknown>) => T | null,
): T[] => {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const item of value.slice(0, max)) {
    if (item && typeof item === "object") {
      const mapped = map(item as Record<string, unknown>);
      if (mapped) out.push(mapped);
    }
  }
  return out;
};

/** Ficha nova: STATs em 5 (valor de partida neutro), sem skills, HP cheio. */
export function emptyCharacter(): CharacterData {
  const stats = Object.fromEntries(STAT_KEYS.map((k) => [k, 5])) as Record<StatKey, number>;
  const data: CharacterData = {
    handle: "",
    role: "",
    rank: 0,
    stats,
    skills: [],
    hpCurrent: 0,
    humanityCurrent: 0,
    luckCurrent: 0,
    headSp: 0,
    headSpMax: 0,
    bodySp: 0,
    bodySpMax: 0,
    weapons: [],
    cyberware: [],
    gear: [],
    eddies: 0,
    lifepath: "",
    notes: "",
  };
  data.hpCurrent = maxHp(data);
  data.humanityCurrent = humanityMax(data);
  data.luckCurrent = stats.LUCK;
  return data;
}

/** Aceita qualquer coisa e devolve uma ficha completa e válida (limites, textos e listas). */
export function sanitizeCharacter(raw: unknown): CharacterData {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const base = emptyCharacter();
  const rawStats = (r.stats && typeof r.stats === "object" ? r.stats : {}) as Record<
    string,
    unknown
  >;
  const stats = Object.fromEntries(
    STAT_KEYS.map((k) => [k, clampInt(rawStats[k], 0, CHARACTER_LIMITS.stat, base.stats[k])]),
  ) as Record<StatKey, number>;
  const short = CHARACTER_LIMITS.textShort;
  const data: CharacterData = {
    handle: clean(r.handle, 40).trim(),
    role: clean(r.role, 40).trim(),
    rank: clampInt(r.rank, 0, 10),
    stats,
    skills: list(r.skills, CHARACTER_LIMITS.skills, (s) => {
      const name = clean(s.name, 40).trim();
      return name
        ? { name, stat: statKey(s.stat), level: clampInt(s.level, 0, CHARACTER_LIMITS.skillLevel) }
        : null;
    }),
    // Sem valor (ficha nova), começa cheio; com valor, nunca passa do máximo.
    hpCurrent: clampInt(r.hpCurrent, 0, maxHp({ stats }), maxHp({ stats })),
    humanityCurrent: clampInt(r.humanityCurrent, 0, humanityMax({ stats }), humanityMax({ stats })),
    luckCurrent: clampInt(r.luckCurrent, 0, stats.LUCK, stats.LUCK),
    headSp: clampInt(r.headSp, 0, 30),
    headSpMax: clampInt(r.headSpMax, 0, 30),
    bodySp: clampInt(r.bodySp, 0, 30),
    bodySpMax: clampInt(r.bodySpMax, 0, 30),
    weapons: list(r.weapons, CHARACTER_LIMITS.weapons, (w) => {
      const name = clean(w.name, 40).trim();
      return name
        ? {
            name,
            skill: clean(w.skill, 40).trim(),
            damage: clean(w.damage, 30).trim(),
            rof: clampInt(w.rof, 0, 10),
            ammo: clampInt(w.ammo, 0, 999),
            ammoMax: clampInt(w.ammoMax, 0, 999),
            notes: clean(w.notes, short),
          }
        : null;
    }),
    cyberware: list(r.cyberware, CHARACTER_LIMITS.cyberware, (c) => {
      const name = clean(c.name, 40).trim();
      return name
        ? { name, humanityLoss: clampInt(c.humanityLoss, 0, 99), notes: clean(c.notes, short) }
        : null;
    }),
    gear: list(r.gear, CHARACTER_LIMITS.gear, (g) => {
      const name = clean(g.name, 40).trim();
      return name ? { name, qty: clampInt(g.qty, 0, 9999, 1), notes: clean(g.notes, short) } : null;
    }),
    eddies: clampInt(r.eddies, 0, 99_999_999),
    lifepath: clean(r.lifepath, CHARACTER_LIMITS.textLong, true),
    notes: clean(r.notes, CHARACTER_LIMITS.textLong, true),
  };
  return data;
}

/** HP máximo: 10 + 5 × (média de BODY e WILL arredondada para cima). */
export function maxHp(data: Pick<CharacterData, "stats">): number {
  return 10 + 5 * Math.ceil((data.stats.BODY + data.stats.WILL) / 2);
}

/** Abaixo (ou igual) a este HP o personagem está gravemente ferido. */
export function seriouslyWoundedAt(data: Pick<CharacterData, "stats">): number {
  return Math.ceil(maxHp(data) / 2);
}

/** Humanity máxima: EMP × 10. */
export function humanityMax(data: Pick<CharacterData, "stats">): number {
  return data.stats.EMP * 10;
}

/** O Death Save usa o valor de BODY. */
export function deathSave(data: Pick<CharacterData, "stats">): number {
  return data.stats.BODY;
}

export type WoundState = "ok" | "serious" | "mortal";

export function woundState(data: Pick<CharacterData, "stats" | "hpCurrent">): WoundState {
  if (data.hpCurrent <= 0) return "mortal";
  return data.hpCurrent <= seriouslyWoundedAt(data) ? "serious" : "ok";
}

/** Total de um teste: STAT + nível da skill. */
export function skillTotal(data: Pick<CharacterData, "stats">, skill: SkillEntry): number {
  return data.stats[skill.stat] + skill.level;
}

/** Expressão de teste (1d10!+total) para a skill. */
export function checkExpression(total: number): string {
  return `1d10!${total < 0 ? "-" : "+"}${Math.abs(total)}`;
}

/** HP para a barra do token. */
export interface HpBar {
  current: number;
  max: number;
}

export const CHARACTER_NAME_FALLBACK = "Sem nome";
