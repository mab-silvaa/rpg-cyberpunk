import type { Express, NextFunction, Request, Response } from "express";
import type Database from "better-sqlite3";
import {
  TOKEN_DEFAULT_COLOR,
  TOKEN_NAME_MAX_LENGTH,
  TOKEN_SIZE_MAX,
  TOKEN_SIZE_MIN,
  type ApiError,
  type TokenInput,
  type TokenMove,
  type TokenView,
} from "@vtt/shared";
import type { VttServer, VttSocket } from "./app.js";
import { imageUrl, type Images } from "./images.js";
import type { Scenes } from "./scenes.js";
import type { Users } from "./users.js";

interface TokenRow {
  id: number;
  scene_id: number;
  name: string;
  x: number;
  y: number;
  size: number;
  color: string;
  image_id: number | null;
  owner_id: number | null;
  hidden: number;
  filename: string | null;
}

const SELECT = `
  SELECT t.id, t.scene_id, t.name, t.x, t.y, t.size, t.color, t.image_id, t.owner_id, t.hidden,
         i.filename
  FROM tokens t LEFT JOIN images i ON i.id = t.image_id`;

const toView = (row: TokenRow): TokenView => ({
  id: row.id,
  sceneId: row.scene_id,
  name: row.name,
  x: row.x,
  y: row.y,
  size: row.size,
  color: row.color,
  imageUrl: row.filename ? imageUrl(row.filename) : null,
  ownerId: row.owner_id,
  hidden: row.hidden === 1,
});

const COORD_LIMIT = 1e6;
export const isCoord = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= COORD_LIMIT;

export type ParseResult = { ok: true; value: TokenInput } | { ok: false; error: string };

/** Valida o corpo de uma requisição de token. Só aceita os campos conhecidos. */
export function parseTokenInput(body: unknown, creating: boolean): ParseResult {
  const raw = (body ?? {}) as Record<string, unknown>;
  const value: TokenInput = {};

  if (creating) {
    if (typeof raw.sceneId !== "number" || !Number.isInteger(raw.sceneId)) {
      return { ok: false, error: "Escolha a cena do token" };
    }
    value.sceneId = raw.sceneId;
  }
  if (raw.name !== undefined || creating) {
    const name = typeof raw.name === "string" ? raw.name.replace(/\p{Cc}/gu, "").trim() : "";
    if (name.length < 1 || name.length > TOKEN_NAME_MAX_LENGTH) {
      return { ok: false, error: `Dê um nome ao token (até ${TOKEN_NAME_MAX_LENGTH} caracteres)` };
    }
    value.name = name;
  }
  if (raw.x !== undefined || raw.y !== undefined) {
    if (!isCoord(raw.x) || !isCoord(raw.y)) return { ok: false, error: "Posição inválida" };
    value.x = raw.x;
    value.y = raw.y;
  }
  if (raw.size !== undefined) {
    const size = raw.size;
    if (
      typeof size !== "number" ||
      !Number.isFinite(size) ||
      size < TOKEN_SIZE_MIN ||
      size > TOKEN_SIZE_MAX ||
      (size * 2) % 1 !== 0
    ) {
      return {
        ok: false,
        error: `O tamanho deve ser de ${TOKEN_SIZE_MIN} a ${TOKEN_SIZE_MAX} quadrados, de meio em meio`,
      };
    }
    value.size = size;
  }
  if (raw.color !== undefined) {
    if (typeof raw.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(raw.color)) {
      return { ok: false, error: "A cor deve ser no formato #rrggbb" };
    }
    value.color = raw.color.toLowerCase();
  }
  for (const key of ["imageId", "ownerId"] as const) {
    const v = raw[key];
    if (v === undefined) continue;
    if (v !== null && (typeof v !== "number" || !Number.isInteger(v))) {
      return { ok: false, error: key === "imageId" ? "Imagem inválida" : "Dono inválido" };
    }
    value[key] = v;
  }
  if (raw.hidden !== undefined) {
    if (typeof raw.hidden !== "boolean")
      return { ok: false, error: "hidden deve ser verdadeiro ou falso" };
    value.hidden = raw.hidden;
  }
  return { ok: true, value };
}

export type TokenError = "scene" | "image" | "owner";

export class Tokens {
  constructor(
    private db: Database.Database,
    private images: Images,
    private scenes: Scenes,
    private users: Users,
  ) {}

  /** Todos os tokens de todas as cenas (visão do mestre). */
  list(): TokenView[] {
    const rows = this.db.prepare(`${SELECT} ORDER BY t.id`).all();
    return (rows as TokenRow[]).map(toView);
  }

  /** Tokens que um jogador pode ver: os não ocultos da cena ativa. */
  visibleToPlayers(): TokenView[] {
    const active = this.scenes.active();
    if (!active) return [];
    const rows = this.db
      .prepare(`${SELECT} WHERE t.scene_id = ? AND t.hidden = 0 ORDER BY t.id`)
      .all(active.id);
    return (rows as TokenRow[]).map(toView);
  }

  byId(id: number): TokenView | null {
    const row = this.db.prepare(`${SELECT} WHERE t.id = ?`).get(id);
    return row ? toView(row as TokenRow) : null;
  }

  /** O jogador recebe este token? Só se não está oculto e é da cena ativa. */
  isVisibleToPlayers(token: TokenView): boolean {
    return !token.hidden && token.sceneId === this.scenes.active()?.id;
  }

  private check(input: TokenInput): TokenError | null {
    if (input.imageId != null && !this.images.byId(input.imageId)) return "image";
    if (input.ownerId != null && !this.users.byId(input.ownerId)) return "owner";
    return null;
  }

  create(input: TokenInput): TokenView | TokenError {
    const scene = this.scenes.byId(input.sceneId!);
    if (!scene) return "scene";
    const error = this.check(input);
    if (error) return error;
    const x = input.x ?? (scene.imageWidth ?? 2000) / 2;
    const y = input.y ?? (scene.imageHeight ?? 1400) / 2;
    const result = this.db
      .prepare(
        `INSERT INTO tokens (scene_id, name, x, y, size, color, image_id, owner_id, hidden)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        scene.id,
        input.name,
        this.clampX(scene.imageWidth, x),
        this.clampY(scene.imageHeight, y),
        input.size ?? 1,
        input.color ?? TOKEN_DEFAULT_COLOR,
        input.imageId ?? null,
        input.ownerId ?? null,
        input.hidden ? 1 : 0,
      );
    return this.byId(Number(result.lastInsertRowid))!;
  }

  update(id: number, input: TokenInput): TokenView | TokenError | null {
    const current = this.byId(id);
    if (!current) return null;
    const error = this.check(input);
    if (error) return error;
    const scene = this.scenes.byId(current.sceneId);
    const x = input.x ?? current.x;
    const y = input.y ?? current.y;
    const previousImage = this.imageIdOf(id);
    this.db
      .prepare(
        `UPDATE tokens SET name = ?, x = ?, y = ?, size = ?, color = ?, image_id = ?, owner_id = ?, hidden = ?
         WHERE id = ?`,
      )
      .run(
        input.name ?? current.name,
        this.clampX(scene?.imageWidth ?? null, x),
        this.clampY(scene?.imageHeight ?? null, y),
        input.size ?? current.size,
        input.color ?? current.color,
        input.imageId === undefined ? previousImage : input.imageId,
        input.ownerId === undefined ? current.ownerId : input.ownerId,
        (input.hidden ?? current.hidden) ? 1 : 0,
        id,
      );
    if (input.imageId !== undefined && input.imageId !== previousImage) {
      this.images.deleteIfUnused(previousImage);
    }
    return this.byId(id);
  }

  /** Grava a posição, mantendo o centro dentro do mapa. Devolve a posição gravada. */
  move(id: number, x: number, y: number): { x: number; y: number } | null {
    const token = this.byId(id);
    if (!token) return null;
    const scene = this.scenes.byId(token.sceneId);
    const pos = this.clampPosition(scene?.imageWidth ?? null, scene?.imageHeight ?? null, x, y);
    this.db.prepare("UPDATE tokens SET x = ?, y = ? WHERE id = ?").run(pos.x, pos.y, id);
    return pos;
  }

  /** Posição que seria gravada para (x, y): centro limitado às bordas do mapa, se ele tem imagem. */
  clampedPosition(token: TokenView, x: number, y: number): { x: number; y: number } {
    const scene = this.scenes.byId(token.sceneId);
    return this.clampPosition(scene?.imageWidth ?? null, scene?.imageHeight ?? null, x, y);
  }

  delete(id: number): boolean {
    const imageId = this.imageIdOf(id);
    const result = this.db.prepare("DELETE FROM tokens WHERE id = ?").run(id);
    if (result.changes === 0) return false;
    this.images.deleteIfUnused(imageId);
    return true;
  }

  private imageIdOf(id: number): number | null {
    const row = this.db.prepare("SELECT image_id FROM tokens WHERE id = ?").get(id) as
      { image_id: number | null } | undefined;
    return row?.image_id ?? null;
  }

  private clampX(width: number | null, x: number): number {
    return width === null ? x : Math.min(Math.max(x, 0), width);
  }

  private clampY(height: number | null, y: number): number {
    return height === null ? y : Math.min(Math.max(y, 0), height);
  }

  private clampPosition(
    width: number | null,
    height: number | null,
    x: number,
    y: number,
  ): { x: number; y: number } {
    return { x: this.clampX(width, x), y: this.clampY(height, y) };
  }
}

/** Quem recebe o quê: o mestre vê todos os tokens; jogadores só os visíveis da cena ativa. */
export class TokenHub {
  constructor(
    private io: VttServer,
    private tokens: Tokens,
  ) {}

  upsert(token: TokenView): void {
    this.io.to("gm").emit("token:upsert", token);
    if (this.tokens.isVisibleToPlayers(token)) this.io.to("players").emit("token:upsert", token);
    // Se ficou oculto, quem o via precisa perdê-lo.
    else this.io.to("players").emit("token:remove", token.id);
  }

  remove(id: number): void {
    this.io.emit("token:remove", id);
  }

  /** A cena ativa mudou ou foi apagada: manda a lista certa para cada papel. */
  resync(): void {
    this.io.to("gm").emit("tokens:set", this.tokens.list());
    this.io.to("players").emit("tokens:set", this.tokens.visibleToPlayers());
  }
}

type Middleware = (req: Request, res: Response, next: NextFunction) => void;

const fail = (res: Response, status: number, error: string): void => {
  const body: ApiError = { error };
  res.status(status).json(body);
};

const ERRORS: Record<TokenError, string> = {
  scene: "Cena não encontrada",
  image: "Essa imagem não existe mais. Envie de novo",
  owner: "Esse jogador não existe mais",
};

/** Rotas HTTP de tokens. Só o mestre cria, altera e apaga. */
export function registerTokenRoutes(deps: {
  app: Express;
  tokens: Tokens;
  hub: TokenHub;
  requireGm: Middleware;
}): void {
  const { app, tokens, hub, requireGm } = deps;

  app.post("/api/tokens", requireGm, (req, res) => {
    const parsed = parseTokenInput(req.body, true);
    if (!parsed.ok) return fail(res, 400, parsed.error);
    const token = tokens.create(parsed.value);
    if (typeof token === "string") return fail(res, 400, ERRORS[token]);
    hub.upsert(token);
    res.status(201).json(token);
  });

  app.patch("/api/tokens/:id", requireGm, (req, res) => {
    const parsed = parseTokenInput(req.body, false);
    if (!parsed.ok) return fail(res, 400, parsed.error);
    const token = tokens.update(Number(req.params.id), parsed.value);
    if (token === null) return fail(res, 404, "Token não encontrado");
    if (typeof token === "string") return fail(res, 400, ERRORS[token]);
    hub.upsert(token);
    res.json(token);
  });

  app.delete("/api/tokens/:id", requireGm, (req, res) => {
    const id = Number(req.params.id);
    if (!tokens.delete(id)) return fail(res, 404, "Token não encontrado");
    hub.remove(id);
    res.status(204).end();
  });
}

const MIN_MOVE_INTERVAL_MS = 30;

/** Arrasto de tokens por conexão. */
export function registerTokenSocket(socket: VttSocket, tokens: Tokens): void {
  const { user } = socket.data;
  let lastDrag = 0;

  /** Devolve a quem tentou o estado verdadeiro do token (ou o some, se não pode vê-lo). */
  const correct = (id: number): void => {
    const token = tokens.byId(id);
    if (token && (user.isGm || tokens.isVisibleToPlayers(token)))
      socket.emit("token:upsert", token);
    else socket.emit("token:remove", id);
  };

  socket.on("token:move", (raw: TokenMove) => {
    const move = raw as Partial<TokenMove> | null;
    if (
      !move ||
      typeof move.id !== "number" ||
      !isCoord(move.x) ||
      !isCoord(move.y) ||
      typeof move.final !== "boolean"
    ) {
      return;
    }
    const token = tokens.byId(move.id);
    if (!token) return correct(move.id);

    // Jogador só move o próprio token, se ele está visível (cena ativa e não oculto).
    const allowed = user.isGm || (token.ownerId === user.id && tokens.isVisibleToPlayers(token));
    if (!allowed) return correct(token.id);

    const now = Date.now();
    if (!move.final) {
      if (now - lastDrag < MIN_MOVE_INTERVAL_MS) return;
      lastDrag = now;
    }

    const pos = move.final
      ? tokens.move(token.id, move.x, move.y)!
      : tokens.clampedPosition(token, move.x, move.y);
    if (tokens.isVisibleToPlayers(token))
      socket.broadcast.emit("token:move", token.id, pos.x, pos.y);
    else socket.to("gm").emit("token:move", token.id, pos.x, pos.y);
    // Se o servidor ajustou a posição (ficou fora do mapa), o próprio autor também precisa saber.
    if (move.final && (pos.x !== move.x || pos.y !== move.y)) {
      socket.emit("token:move", token.id, pos.x, pos.y);
    }
  });
}
