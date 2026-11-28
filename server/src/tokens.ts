import type { Express, NextFunction, Request, Response } from "express";
import type Database from "better-sqlite3";
import {
  TOKEN_DEFAULT_COLOR,
  TOKEN_NAME_MAX_LENGTH,
  TOKEN_SIZE_MAX,
  TOKEN_SIZE_MIN,
  conditionOf,
  isFogged,
  maxHp,
  type ApiError,
  type CharacterData,
  type TokenInput,
  type TokenMove,
  type TokenView,
} from "@vtt/shared";
import type { VttServer, VttSocket } from "./app.js";
import { imageUrl, type Images } from "./images.js";
import type { Fog } from "./fog.js";
import type { Scenes } from "./scenes.js";
import type { User } from "@vtt/shared";
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
  hostile: number;
  defeated: number;
  character_id: number | null;
  filename: string | null;
  char_data: string | null;
}

const SELECT = `
  SELECT t.id, t.scene_id, t.name, t.x, t.y, t.size, t.color, t.image_id, t.owner_id, t.hidden, t.hostile, t.defeated,
         t.character_id, i.filename, c.data AS char_data
  FROM tokens t
  LEFT JOIN images i ON i.id = t.image_id
  LEFT JOIN characters c ON c.id = t.character_id`;

/** Hostil com a ficha em zero de HP cai sozinho; NPC aliado só pela marca; jogador nunca. */
const isDefeated = (
  row: Pick<TokenRow, "owner_id" | "hostile" | "defeated">,
  hp: { current: number; max: number } | null,
): boolean =>
  row.owner_id === null &&
  (row.defeated === 1 || (row.hostile === 1 && hp !== null && hp.max > 0 && hp.current <= 0));

const toView = (row: TokenRow): TokenView => {
  const hp = row.char_data ? hpOf(JSON.parse(row.char_data) as CharacterData) : null;
  return viewOf(row, hp);
};

const viewOf = (row: TokenRow, hp: { current: number; max: number } | null): TokenView => ({
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
  hostile: row.hostile === 1,
  defeated: isDefeated(row, hp),
  characterId: row.character_id,
  condition: hp !== null && hp.max > 0 ? conditionOf(hp) : null,
  hp,
});

const hpOf = (data: CharacterData): { current: number; max: number } => ({
  current: data.hpCurrent,
  max: maxHp(data),
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
  for (const key of ["imageId", "ownerId", "characterId"] as const) {
    const v = raw[key];
    if (v === undefined) continue;
    if (v !== null && (typeof v !== "number" || !Number.isInteger(v))) {
      return {
        ok: false,
        error:
          key === "imageId"
            ? "Imagem inválida"
            : key === "ownerId"
              ? "Dono inválido"
              : "Ficha inválida",
      };
    }
    value[key] = v;
  }
  if (raw.hidden !== undefined) {
    if (typeof raw.hidden !== "boolean")
      return { ok: false, error: "hidden deve ser verdadeiro ou falso" };
    value.hidden = raw.hidden;
  }
  if (raw.hostile !== undefined) {
    if (typeof raw.hostile !== "boolean")
      return { ok: false, error: "hostile deve ser verdadeiro ou falso" };
    value.hostile = raw.hostile;
  }
  if (raw.defeated !== undefined) {
    if (typeof raw.defeated !== "boolean")
      return { ok: false, error: "defeated deve ser verdadeiro ou falso" };
    value.defeated = raw.defeated;
  }
  return { ok: true, value };
}

export type TokenError = "scene" | "image" | "owner" | "character";

export class Tokens {
  constructor(
    private db: Database.Database,
    private images: Images,
    private scenes: Scenes,
    private users: Users,
    private fog: Fog,
  ) {}

  /** Todos os tokens de todas as cenas (visão do mestre). */
  list(): TokenView[] {
    const rows = this.db.prepare(`${SELECT} ORDER BY t.id`).all();
    return (rows as TokenRow[]).map(toView);
  }

  byId(id: number): TokenView | null {
    const row = this.db.prepare(`${SELECT} WHERE t.id = ?`).get(id);
    return row ? toView(row as TokenRow) : null;
  }

  /** O centro do token está sob fog? */
  isFogged(token: Pick<TokenView, "sceneId" | "x" | "y">): boolean {
    const fog = this.fog.state(token.sceneId);
    return fog !== null && isFogged(fog, token.x, token.y);
  }

  /**
   * Este usuário recebe este token? O mestre vê todos. Jogador vê o que não está oculto, é da cena
   * ativa e não está sob fog; o dono sempre vê o próprio token (se não está oculto).
   */
  canSee(user: User, token: TokenView, fogged?: boolean): boolean {
    if (user.isGm) return true;
    if (token.hidden || token.sceneId !== this.scenes.active()?.id) return false;
    if (token.ownerId === user.id) return true;
    return !(fogged ?? this.isFogged(token));
  }

  /** Tokens que este usuário recebe. */
  visibleTo(user: User): TokenView[] {
    return this.list()
      .filter((token) => this.canSee(user, token))
      .map((token) => this.forUser(user, token));
  }

  /** O que este usuário pode ver do token: jogador não recebe o HP de fichas sem dono (NPCs). */
  forUser(user: User, token: TokenView): TokenView {
    if (user.isGm || !token.hp || token.characterId === null) return token;
    const owner = this.db
      .prepare("SELECT owner_id FROM characters WHERE id = ?")
      .get(token.characterId) as { owner_id: number | null } | undefined;
    return owner?.owner_id == null ? { ...token, hp: null } : token;
  }

  byCharacter(characterId: number): TokenView[] {
    const rows = this.db.prepare(`${SELECT} WHERE t.character_id = ?`).all(characterId);
    return (rows as TokenRow[]).map(toView);
  }

  private check(input: TokenInput): TokenError | null {
    if (input.imageId != null && !this.images.byId(input.imageId)) return "image";
    if (input.ownerId != null && !this.users.byId(input.ownerId)) return "owner";
    if (
      input.characterId != null &&
      !this.db.prepare("SELECT 1 FROM characters WHERE id = ?").get(input.characterId)
    ) {
      return "character";
    }
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
        `INSERT INTO tokens (scene_id, name, x, y, size, color, image_id, owner_id, hidden, hostile, defeated, character_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        input.hostile ? 1 : 0,
        input.defeated ? 1 : 0,
        input.characterId ?? null,
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
        `UPDATE tokens SET name = ?, x = ?, y = ?, size = ?, color = ?, image_id = ?, owner_id = ?, hidden = ?, hostile = ?, defeated = ?,
         character_id = ? WHERE id = ?`,
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
        (input.hostile ?? current.hostile) ? 1 : 0,
        this.storedDefeated(id, input),
        input.characterId === undefined ? current.characterId : input.characterId,
        id,
      );
    if (input.imageId !== undefined && input.imageId !== previousImage) {
      this.images.deleteIfUnused(previousImage);
    }
    return this.byId(id);
  }

  /** Valor gravado de "derrotado": só muda quando o pedido traz o campo (o mestre marca ou desfaz). */
  private storedDefeated(id: number, input: TokenInput): number {
    if (input.defeated === undefined) {
      const row = this.db.prepare("SELECT defeated FROM tokens WHERE id = ?").get(id) as
        { defeated: number } | undefined;
      return row?.defeated ?? 0;
    }
    return input.defeated ? 1 : 0;
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

/**
 * Quem recebe o quê. O mestre vê todos os tokens. Cada jogador recebe só os que pode ver, e a
 * lista do que cada conexão já tem fica aqui, para mandar "novo" ou "some" na hora certa.
 */
export class TokenHub {
  /** Tokens que cada conexão de jogador tem agora. */
  private seen = new Map<string, Set<number>>();

  constructor(
    private io: VttServer,
    private tokens: Tokens,
    /** Algo que a iniciativa mostra (derrotado, nome) pode ter mudado. */
    private onChange: () => void = () => {},
  ) {}

  /** Chamado ao conectar: devolve os tokens do snapshot e passa a acompanhar a conexão. */
  attach(socket: VttSocket): TokenView[] {
    const { user } = socket.data;
    const list = this.tokens.visibleTo(user);
    if (!user.isGm) this.seen.set(socket.id, new Set(list.map((t) => t.id)));
    return list;
  }

  detach(socket: VttSocket): void {
    this.seen.delete(socket.id);
  }

  private players(): VttSocket[] {
    return [...this.io.sockets.sockets.values()].filter((s) => !s.data.user.isGm);
  }

  /** Token novo ou alterado. */
  upsert(token: TokenView): void {
    this.io.to("gm").emit("token:upsert", token);
    const fogged = this.tokens.isFogged(token);
    for (const socket of this.players()) this.deliver(socket, token, fogged, "upsert");
    this.onChange();
  }

  /**
   * Token arrastado para (x, y). Quem não era o autor recebe o movimento; quem passou a ver ou a
   * deixar de ver o token (por causa da fog) recebe o token novo ou o "some".
   */
  moved(token: TokenView, x: number, y: number, fromSocketId: string): void {
    const next = { ...token, x, y };
    const fogged = this.tokens.isFogged(next);
    for (const socket of this.io.sockets.sockets.values()) {
      if (socket.id === fromSocketId) continue;
      if (socket.data.user.isGm) socket.emit("token:move", token.id, x, y);
      else this.deliver(socket, next, fogged, "move");
    }
  }

  private deliver(
    socket: VttSocket,
    token: TokenView,
    fogged: boolean,
    kind: "upsert" | "move",
  ): void {
    const seen = this.seen.get(socket.id);
    if (!seen) return;
    const visible = this.tokens.canSee(socket.data.user, token, fogged);
    const has = seen.has(token.id);
    if (visible) {
      seen.add(token.id);
      if (kind === "move" && has) socket.emit("token:move", token.id, token.x, token.y);
      else socket.emit("token:upsert", this.tokens.forUser(socket.data.user, token));
    } else if (has) {
      seen.delete(token.id);
      socket.emit("token:remove", token.id);
    }
  }

  remove(id: number): void {
    for (const seen of this.seen.values()) seen.delete(id);
    this.io.emit("token:remove", id);
    this.onChange();
  }

  /** A cena ativa mudou ou foi apagada: manda a lista inteira certa para cada um. */
  resync(): void {
    this.io.to("gm").emit("tokens:set", this.tokens.list());
    for (const socket of this.players()) {
      const list = this.tokens.visibleTo(socket.data.user);
      this.seen.set(socket.id, new Set(list.map((t) => t.id)));
      socket.emit("tokens:set", list);
    }
  }

  /** A fog mudou: manda só a diferença (quem ficou à vista, quem sumiu). */
  refresh(): void {
    for (const socket of this.players()) {
      const seen = this.seen.get(socket.id) ?? new Set<number>();
      const now = this.tokens.visibleTo(socket.data.user);
      const ids = new Set(now.map((t) => t.id));
      for (const token of now) if (!seen.has(token.id)) socket.emit("token:upsert", token);
      for (const id of seen) if (!ids.has(id)) socket.emit("token:remove", id);
      this.seen.set(socket.id, ids);
    }
  }
}

type Middleware = (req: Request, res: Response, next: NextFunction) => void;

const fail = (res: Response, status: number, error: string): void => {
  const body: ApiError = { error };
  res.status(status).json(body);
};

const ERRORS: Record<TokenError, string> = {
  character: "Essa ficha não existe mais",
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
export function registerTokenSocket(socket: VttSocket, tokens: Tokens, hub: TokenHub): void {
  const { user } = socket.data;
  let lastDrag = 0;

  /** Devolve a quem tentou o estado verdadeiro do token (ou o some, se não pode vê-lo). */
  const correct = (id: number): void => {
    const token = tokens.byId(id);
    if (token && tokens.canSee(user, token))
      socket.emit("token:upsert", tokens.forUser(user, token));
    else socket.emit("token:remove", id);
  };

  socket.on("disconnect", () => hub.detach(socket));

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

    // Jogador só move o próprio token, enquanto ele está à vista dele (cena ativa, não oculto).
    if (!user.isGm && !(token.ownerId === user.id && tokens.canSee(user, token))) {
      return correct(token.id);
    }

    const now = Date.now();
    if (!move.final) {
      if (now - lastDrag < MIN_MOVE_INTERVAL_MS) return;
      lastDrag = now;
    }

    const pos = move.final
      ? tokens.move(token.id, move.x, move.y)!
      : tokens.clampedPosition(token, move.x, move.y);
    hub.moved(token, pos.x, pos.y, socket.id);
    // Se o servidor ajustou a posição (ficou fora do mapa), o próprio autor também precisa saber.
    if (move.final && (pos.x !== move.x || pos.y !== move.y)) {
      socket.emit("token:move", token.id, pos.x, pos.y);
    }
  });
}
