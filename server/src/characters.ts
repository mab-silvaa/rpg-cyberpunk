import type { Express, NextFunction, Request, Response } from "express";
import type Database from "better-sqlite3";
import {
  maxHp,
  sanitizeCharacter,
  type ApiError,
  type CharacterData,
  type CharacterReply,
  type CharacterView,
  type User,
} from "@vtt/shared";
import type { VttServer, VttSocket } from "./app.js";
import type { Users } from "./users.js";

interface Row {
  id: number;
  owner_id: number | null;
  data: string;
  updated_at: string;
}

const toView = (row: Row): CharacterView => ({
  id: row.id,
  ownerId: row.owner_id,
  data: JSON.parse(row.data) as CharacterData,
  updatedAt: row.updated_at,
});

const SELECT = "SELECT id, owner_id, data, updated_at FROM characters";

const PATCHABLE: (keyof CharacterData)[] = [
  "handle",
  "role",
  "rank",
  "stats",
  "skills",
  "hpCurrent",
  "humanityCurrent",
  "luckCurrent",
  "headSp",
  "headSpMax",
  "bodySp",
  "bodySpMax",
  "weapons",
  "cyberware",
  "gear",
  "eddies",
  "lifepath",
  "notes",
];

export class Characters {
  constructor(
    private db: Database.Database,
    private users: Users,
  ) {}

  list(): CharacterView[] {
    return (this.db.prepare(`${SELECT} ORDER BY id`).all() as Row[]).map(toView);
  }

  forUser(user: User): CharacterView[] {
    return user.isGm
      ? this.list()
      : (this.db.prepare(`${SELECT} WHERE owner_id = ? ORDER BY id`).all(user.id) as Row[]).map(
          toView,
        );
  }

  byId(id: number): CharacterView | null {
    const row = this.db.prepare(`${SELECT} WHERE id = ?`).get(id) as Row | undefined;
    return row ? toView(row) : null;
  }

  ownedBy(userId: number): CharacterView[] {
    return (this.db.prepare(`${SELECT} WHERE owner_id = ?`).all(userId) as Row[]).map(toView);
  }

  /** Cria uma ficha. Devolve "owner" se o dono não existe. */
  create(ownerId: number | null, data?: unknown): CharacterView | "owner" {
    if (ownerId !== null && !this.users.byId(ownerId)) return "owner";
    const sheet = sanitizeCharacter(data);
    const result = this.db
      .prepare("INSERT INTO characters (owner_id, data) VALUES (?, ?)")
      .run(ownerId, JSON.stringify(sheet));
    return this.byId(Number(result.lastInsertRowid))!;
  }

  /** Aplica os campos enviados por cima da ficha e grava o resultado já validado. */
  patch(id: number, patch: unknown): CharacterView | null {
    const current = this.byId(id);
    if (!current) return null;
    const incoming = (patch && typeof patch === "object" ? patch : {}) as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...current.data };
    for (const key of PATCHABLE) if (key in incoming) merged[key] = incoming[key];
    const data = sanitizeCharacter(merged);
    this.db
      .prepare("UPDATE characters SET data = ?, updated_at = datetime('now') WHERE id = ?")
      .run(JSON.stringify(data), id);
    return this.byId(id);
  }

  /** Muda o dono. Devolve "owner" se o usuário não existe. */
  setOwner(id: number, ownerId: number | null): CharacterView | "owner" | null {
    if (!this.byId(id)) return null;
    if (ownerId !== null && !this.users.byId(ownerId)) return "owner";
    this.db.prepare("UPDATE characters SET owner_id = ? WHERE id = ?").run(ownerId, id);
    return this.byId(id);
  }

  delete(id: number): boolean {
    return this.db.prepare("DELETE FROM characters WHERE id = ?").run(id).changes > 0;
  }

  /** HP e se ele é público (ficha com dono = personagem de jogador). */
  hpOf(id: number): { current: number; max: number; owned: boolean } | null {
    const c = this.byId(id);
    return c ? { current: c.data.hpCurrent, max: maxHp(c.data), owned: c.ownerId !== null } : null;
  }
}

/** Manda a ficha para quem pode vê-la: o mestre e o dono. */
export class CharacterHub {
  constructor(private io: VttServer) {}

  update(character: CharacterView, exceptSocketId?: string): void {
    let target = this.io.to("gm");
    if (character.ownerId !== null) target = target.to(`user:${character.ownerId}`);
    if (exceptSocketId) target = target.except(exceptSocketId);
    target.emit("character:update", character);
  }

  remove(id: number, ownerId: number | null): void {
    let target = this.io.to("gm");
    if (ownerId !== null) target = target.to(`user:${ownerId}`);
    target.emit("character:remove", id);
  }
}

type Middleware = (req: Request, res: Response, next: NextFunction) => void;

const fail = (res: Response, status: number, error: string): void => {
  const body: ApiError = { error };
  res.status(status).json(body);
};

export function registerCharacterRoutes(deps: {
  app: Express;
  characters: Characters;
  hub: CharacterHub;
  requireUser: Middleware;
  requireGm: Middleware;
  /** Depois de qualquer mudança na ficha: atualiza os tokens ligados a ela. */
  onChanged: (id: number, tokenIds?: number[]) => void;
  /** Tokens ligados à ficha agora (para guardar antes de apagá-la). */
  tokenIdsOf: (id: number) => number[];
}): void {
  const { app, characters, hub, requireUser, requireGm, onChanged, tokenIdsOf } = deps;

  app.post("/api/characters", requireUser, (req, res) => {
    const user = res.locals.user as User;
    const body = (req.body ?? {}) as { ownerId?: unknown; data?: unknown };
    let ownerId: number | null = user.id;
    if (user.isGm) {
      if (body.ownerId === undefined || body.ownerId === null) ownerId = null;
      else if (typeof body.ownerId === "number" && Number.isInteger(body.ownerId))
        ownerId = body.ownerId;
      else return fail(res, 400, "Dono inválido");
    } else if (characters.ownedBy(user.id).length > 0) {
      return fail(res, 409, "Você já tem uma ficha");
    }
    const created = characters.create(ownerId, body.data);
    if (created === "owner") return fail(res, 400, "Esse jogador não existe mais");
    hub.update(created);
    res.status(201).json(created);
  });

  app.patch("/api/characters/:id", requireGm, (req, res) => {
    const raw = (req.body as { ownerId?: unknown } | undefined)?.ownerId;
    if (raw !== null && (typeof raw !== "number" || !Number.isInteger(raw))) {
      return fail(res, 400, "Dono inválido");
    }
    const before = characters.byId(Number(req.params.id));
    const updated = characters.setOwner(Number(req.params.id), raw);
    if (updated === null) return fail(res, 404, "Ficha não encontrada");
    if (updated === "owner") return fail(res, 400, "Esse jogador não existe mais");
    if (before?.ownerId != null && before.ownerId !== updated.ownerId) {
      hub.remove(updated.id, before.ownerId);
    }
    hub.update(updated);
    onChanged(updated.id);
    res.json(updated);
  });

  app.delete("/api/characters/:id", requireGm, (req, res) => {
    const id = Number(req.params.id);
    const before = characters.byId(id);
    const linked = tokenIdsOf(id);
    if (!before || !characters.delete(id)) return fail(res, 404, "Ficha não encontrada");
    hub.remove(id, before.ownerId);
    onChanged(id, linked);
    res.status(204).end();
  });
}

/** Autosave da ficha por socket. */
export function registerCharacterSocket(
  socket: VttSocket,
  characters: Characters,
  hub: CharacterHub,
  onChanged: (id: number) => void,
): void {
  const { user } = socket.data;
  socket.on("character:patch", (id, patch, ack) => {
    if (typeof ack !== "function") return;
    const reply = (r: CharacterReply): void => ack(r);
    if (typeof id !== "number") return reply({ ok: false, error: "Ficha inválida" });
    const current = characters.byId(id);
    if (!current || (!user.isGm && current.ownerId !== user.id)) {
      return reply({ ok: false, error: "Você não pode editar essa ficha" });
    }
    const updated = characters.patch(id, patch);
    if (!updated) return reply({ ok: false, error: "Ficha não encontrada" });
    reply({ ok: true, character: updated });
    hub.update(updated, socket.id);
    onChanged(id);
  });
}
