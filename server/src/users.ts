import type Database from "better-sqlite3";
import { NAME_MAX_LENGTH, NAME_MIN_LENGTH, type User } from "@vtt/shared";

interface UserRow {
  id: number;
  name: string;
  is_gm: number;
}

const toUser = (row: UserRow): User => ({ id: row.id, name: row.name, isGm: row.is_gm === 1 });

/** Tira caracteres de controle, junta espaços e confere o tamanho. Null se o nome não serve. */
export function normalizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw
    .replace(/\p{Cc}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return name.length >= NAME_MIN_LENGTH && name.length <= NAME_MAX_LENGTH ? name : null;
}

const nameKey = (name: string): string => name.toLowerCase();

export class Users {
  constructor(private db: Database.Database) {}

  byId(id: number): User | null {
    const row = this.db.prepare("SELECT id, name, is_gm FROM users WHERE id = ?").get(id);
    return row ? toUser(row as UserRow) : null;
  }

  byName(name: string): User | null {
    const row = this.db
      .prepare("SELECT id, name, is_gm FROM users WHERE name_key = ?")
      .get(nameKey(name));
    return row ? toUser(row as UserRow) : null;
  }

  list(): User[] {
    const rows = this.db.prepare("SELECT id, name, is_gm FROM users ORDER BY is_gm DESC, id").all();
    return (rows as UserRow[]).map(toUser);
  }

  create(name: string, isGm: boolean): User {
    const result = this.db
      .prepare("INSERT INTO users (name, name_key, is_gm) VALUES (?, ?, ?)")
      .run(name, nameKey(name), isGm ? 1 : 0);
    return { id: Number(result.lastInsertRowid), name, isGm };
  }

  promoteToGm(id: number): void {
    this.db.prepare("UPDATE users SET is_gm = 1 WHERE id = ?").run(id);
  }

  /** Renomeia; devolve false se outro usuário já usa o nome. */
  rename(id: number, name: string): boolean {
    const other = this.byName(name);
    if (other && other.id !== id) return false;
    this.db
      .prepare("UPDATE users SET name = ?, name_key = ? WHERE id = ?")
      .run(name, nameKey(name), id);
    return true;
  }

  touch(id: number): void {
    this.db.prepare("UPDATE users SET last_seen_at = datetime('now') WHERE id = ?").run(id);
  }

  delete(id: number): void {
    this.db.prepare("DELETE FROM users WHERE id = ?").run(id);
  }
}

/** Quem está conectado agora (um usuário pode ter várias abas). */
export class Presence {
  private sockets = new Map<number, Set<string>>();

  add(userId: number, socketId: string): void {
    const set = this.sockets.get(userId) ?? new Set<string>();
    set.add(socketId);
    this.sockets.set(userId, set);
  }

  remove(userId: number, socketId: string): void {
    const set = this.sockets.get(userId);
    set?.delete(socketId);
    if (set?.size === 0) this.sockets.delete(userId);
  }

  isOnline(userId: number): boolean {
    return this.sockets.has(userId);
  }
}
