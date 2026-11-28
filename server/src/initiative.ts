import type { Express, NextFunction, Request, Response } from "express";
import type Database from "better-sqlite3";
import {
  INITIATIVE_MAX_ENTRIES,
  INITIATIVE_NAME_MAX_LENGTH,
  INITIATIVE_VALUE_LIMIT,
  type ApiError,
  type InitiativeEntry,
  type InitiativeEntryInput,
  type InitiativeView,
} from "@vtt/shared";

interface EntryRow {
  id: number;
  name: string;
  value: number | null;
  token_id: number | null;
  hidden: number;
}

const toEntry = (row: EntryRow, defeated = false): InitiativeEntry => ({
  id: row.id,
  name: row.name,
  value: row.value,
  hidden: row.hidden === 1,
  tokenId: row.token_id,
  defeated,
});

export type ParseResult = { ok: true; value: InitiativeEntryInput } | { ok: false; error: string };

export function parseEntryInput(body: unknown, creating: boolean): ParseResult {
  const raw = (body ?? {}) as Record<string, unknown>;
  const value: InitiativeEntryInput = {};
  if (raw.name !== undefined || creating) {
    const name = typeof raw.name === "string" ? raw.name.replace(/\p{Cc}/gu, "").trim() : "";
    if (name.length < 1 || name.length > INITIATIVE_NAME_MAX_LENGTH) {
      return { ok: false, error: `Dê um nome (até ${INITIATIVE_NAME_MAX_LENGTH} caracteres)` };
    }
    value.name = name;
  }
  if (raw.value !== undefined) {
    if (
      raw.value !== null &&
      (typeof raw.value !== "number" ||
        !Number.isFinite(raw.value) ||
        Math.abs(raw.value) > INITIATIVE_VALUE_LIMIT)
    ) {
      return { ok: false, error: "Valor de iniciativa inválido" };
    }
    value.value = raw.value;
  }
  if (raw.hidden !== undefined) {
    if (typeof raw.hidden !== "boolean")
      return { ok: false, error: "hidden deve ser verdadeiro ou falso" };
    value.hidden = raw.hidden;
  }
  if (raw.tokenId !== undefined) {
    if (
      raw.tokenId !== null &&
      (typeof raw.tokenId !== "number" || !Number.isInteger(raw.tokenId))
    ) {
      return { ok: false, error: "Token inválido" };
    }
    value.tokenId = raw.tokenId;
  }
  return { ok: true, value };
}

export class Initiative {
  /** `isDefeated` diz se o token ligado a uma entrada está derrotado (a vez o pula). */
  constructor(
    private db: Database.Database,
    private isDefeated: (tokenId: number) => boolean = () => false,
  ) {}

  /** Entradas na ordem de jogo: maior valor primeiro, sem valor no fim, empate pela ordem de entrada. */
  entries(): InitiativeEntry[] {
    const rows = this.db
      .prepare(
        "SELECT id, name, value, token_id, hidden FROM initiative_entries ORDER BY value IS NULL, value DESC, id",
      )
      .all() as EntryRow[];
    return rows.map((row) => this.entry(row));
  }

  private entry(row: EntryRow): InitiativeEntry {
    return toEntry(row, row.token_id !== null && this.isDefeated(row.token_id));
  }

  private state(): { round: number; activeId: number | null } {
    const row = this.db.prepare("SELECT round, active_entry_id FROM combat WHERE id = 1").get() as {
      round: number;
      active_entry_id: number | null;
    };
    return { round: row.round, activeId: row.active_entry_id };
  }

  private setState(round: number, activeId: number | null): void {
    this.db
      .prepare("UPDATE combat SET round = ?, active_entry_id = ? WHERE id = 1")
      .run(round, activeId);
  }

  /** Mestre: tudo. Jogador: só a ordem, sem valores nem entradas ocultas. */
  view(isGm: boolean): InitiativeView {
    const { round, activeId } = this.state();
    const entries = this.entries();
    if (isGm) return { round, activeId, entries };
    const visible = entries.filter((e) => !e.hidden).map((e) => ({ ...e, value: null }));
    return {
      round,
      activeId: visible.some((e) => e.id === activeId) ? activeId : null,
      entries: visible,
    };
  }

  byId(id: number): InitiativeEntry | null {
    const row = this.db
      .prepare("SELECT id, name, value, token_id, hidden FROM initiative_entries WHERE id = ?")
      .get(id) as EntryRow | undefined;
    return row ? this.entry(row) : null;
  }

  /** Acrescenta uma entrada. Devolve "limit" se a lista está cheia. */
  add(input: InitiativeEntryInput): InitiativeEntry | "limit" {
    const count = (
      this.db.prepare("SELECT COUNT(*) AS n FROM initiative_entries").get() as { n: number }
    ).n;
    if (count >= INITIATIVE_MAX_ENTRIES) return "limit";
    const result = this.db
      .prepare("INSERT INTO initiative_entries (name, value, token_id, hidden) VALUES (?, ?, ?, ?)")
      .run(input.name, input.value ?? null, input.tokenId ?? null, input.hidden ? 1 : 0);
    return this.byId(Number(result.lastInsertRowid))!;
  }

  /** Entradas para tokens que ainda não estão na lista. */
  addTokens(tokens: { id: number; name: string; hidden: boolean }[]): InitiativeEntry[] {
    const present = new Set(
      (
        this.db
          .prepare("SELECT token_id FROM initiative_entries WHERE token_id IS NOT NULL")
          .all() as { token_id: number }[]
      ).map((r) => r.token_id),
    );
    const added: InitiativeEntry[] = [];
    for (const token of tokens) {
      if (present.has(token.id)) continue;
      const entry = this.add({ name: token.name, hidden: token.hidden, tokenId: token.id });
      if (entry === "limit") break;
      added.push(entry);
    }
    return added;
  }

  update(id: number, input: InitiativeEntryInput): InitiativeEntry | null {
    const current = this.byId(id);
    if (!current) return null;
    this.db
      .prepare(
        "UPDATE initiative_entries SET name = ?, value = ?, hidden = ?, token_id = ? WHERE id = ?",
      )
      .run(
        input.name ?? current.name,
        input.value === undefined ? current.value : input.value,
        (input.hidden ?? current.hidden) ? 1 : 0,
        input.tokenId === undefined ? current.tokenId : input.tokenId,
        id,
      );
    return this.byId(id);
  }

  /** Remove a entrada; se ela estava na vez, a vez passa para a seguinte. */
  remove(id: number): boolean {
    const entries = this.entries();
    const index = entries.findIndex((e) => e.id === id);
    if (index === -1) return false;
    const { round, activeId } = this.state();
    if (activeId === id) {
      const rest = entries.filter((e) => e.id !== id);
      const next = rest.length === 0 ? null : rest[index % rest.length]!.id;
      this.setState(round, next);
    }
    this.db.prepare("DELETE FROM initiative_entries WHERE id = ?").run(id);
    return true;
  }

  /** Começa o combate: rodada 1, na vez a primeira entrada. */
  start(): "empty" | null {
    const entries = this.entries();
    const first = entries.find((e) => !e.defeated) ?? entries[0];
    if (!first) return "empty";
    this.setState(1, first.id);
    return null;
  }

  /** Passa a vez; ao voltar ao começo da lista, começa uma nova rodada. */
  next(): "not-started" | "empty" | null {
    const { round, activeId } = this.state();
    if (round === 0) return "not-started";
    const entries = this.entries();
    if (entries.length === 0) return "empty";
    const index = entries.findIndex((e) => e.id === activeId);
    // Quem está derrotado é pulado; se todos estão, a vez anda como de costume.
    let at = index;
    let nextRound = round;
    for (let step = 0; step < entries.length; step++) {
      at += 1;
      if (at >= entries.length) {
        at = 0;
        nextRound += 1;
      }
      if (!entries[at]!.defeated) break;
    }
    if (index === -1) {
      const first = entries.findIndex((e) => !e.defeated);
      this.setState(round, entries[first === -1 ? 0 : first]!.id);
    } else {
      this.setState(nextRound, entries[at]!.id);
    }
    return null;
  }

  /** Encerra o combate, mantendo as entradas. */
  end(): void {
    this.setState(0, null);
  }

  /** Esvazia a lista e encerra o combate. */
  clear(): void {
    this.db.prepare("DELETE FROM initiative_entries").run();
    this.setState(0, null);
  }
}

type Middleware = (req: Request, res: Response, next: NextFunction) => void;

const fail = (res: Response, status: number, error: string): void => {
  const body: ApiError = { error };
  res.status(status).json(body);
};

/** Rotas da iniciativa. Só o mestre mexe; todos recebem a ordem pelo socket. */
export function registerInitiativeRoutes(deps: {
  app: Express;
  initiative: Initiative;
  requireGm: Middleware;
  /** Tokens que existem, para montar entradas a partir deles. */
  tokensById: (ids: number[]) => { id: number; name: string; hidden: boolean }[];
  /** Rola 1d10 + REF para a entrada (quando há ficha ligada) e devolve o total, ou null. */
  rollFor: (entry: InitiativeEntry) => number | null;
  onChange: () => void;
}): void {
  const { app, initiative, requireGm, tokensById, rollFor, onChange } = deps;
  const done = (res: Response, status = 200): void => {
    onChange();
    res.status(status).json(initiative.view(true));
  };

  app.get("/api/initiative", requireGm, (_req, res) => {
    res.json(initiative.view(true));
  });

  app.post("/api/initiative/entries", requireGm, (req, res) => {
    const parsed = parseEntryInput(req.body, true);
    if (!parsed.ok) return fail(res, 400, parsed.error);
    if (initiative.add(parsed.value) === "limit") {
      return fail(res, 409, `A iniciativa aceita até ${INITIATIVE_MAX_ENTRIES} entradas`);
    }
    done(res, 201);
  });

  app.patch("/api/initiative/entries/:id", requireGm, (req, res) => {
    const parsed = parseEntryInput(req.body, false);
    if (!parsed.ok) return fail(res, 400, parsed.error);
    if (!initiative.update(Number(req.params.id), parsed.value)) {
      return fail(res, 404, "Entrada não encontrada");
    }
    done(res);
  });

  app.delete("/api/initiative/entries/:id", requireGm, (req, res) => {
    if (!initiative.remove(Number(req.params.id))) return fail(res, 404, "Entrada não encontrada");
    done(res);
  });

  app.post("/api/initiative/from-tokens", requireGm, (req, res) => {
    const ids = (req.body as { tokenIds?: unknown } | undefined)?.tokenIds;
    if (!Array.isArray(ids) || !ids.every((id) => Number.isInteger(id)) || ids.length > 200) {
      return fail(res, 400, "Lista de tokens inválida");
    }
    initiative.addTokens(tokensById(ids as number[]));
    done(res);
  });

  app.post("/api/initiative/roll", requireGm, (req, res) => {
    const ids = (req.body as { entryIds?: unknown } | undefined)?.entryIds;
    if (ids !== undefined && (!Array.isArray(ids) || !ids.every((id) => Number.isInteger(id)))) {
      return fail(res, 400, "Lista de entradas inválida");
    }
    // Sem lista, rola para quem ainda não tem valor.
    const targets = initiative
      .entries()
      .filter((e) => (ids ? (ids as number[]).includes(e.id) : e.value === null));
    for (const entry of targets) {
      const total = rollFor(entry);
      if (total !== null) initiative.update(entry.id, { value: total });
    }
    done(res);
  });

  app.post("/api/initiative/start", requireGm, (_req, res) => {
    if (initiative.start() === "empty") return fail(res, 409, "Acrescente alguém à iniciativa");
    done(res);
  });

  app.post("/api/initiative/next", requireGm, (_req, res) => {
    const result = initiative.next();
    if (result === "not-started") return fail(res, 409, "O combate ainda não começou");
    if (result === "empty") return fail(res, 409, "A iniciativa está vazia");
    done(res);
  });

  app.post("/api/initiative/end", requireGm, (_req, res) => {
    initiative.end();
    done(res);
  });

  app.post("/api/initiative/clear", requireGm, (_req, res) => {
    initiative.clear();
    done(res);
  });
}
