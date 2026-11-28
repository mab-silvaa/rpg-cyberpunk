import type { Express, NextFunction, Request, Response } from "express";
import type Database from "better-sqlite3";
import {
  NOTE_BODY_MAX_LENGTH,
  NOTE_TITLE_MAX_LENGTH,
  NOTES_MAX,
  type ApiError,
  type Note,
  type NoteInput,
} from "@vtt/shared";

interface Row {
  id: number;
  title: string;
  body: string;
  updated_at: string;
}

const toNote = (row: Row): Note => ({
  id: row.id,
  title: row.title,
  body: row.body,
  updatedAt: row.updated_at,
});

export type ParseResult = { ok: true; value: NoteInput } | { ok: false; error: string };

export function parseNoteInput(body: unknown, creating: boolean): ParseResult {
  const raw = (body ?? {}) as Record<string, unknown>;
  const value: NoteInput = {};
  if (raw.title !== undefined || creating) {
    const title = typeof raw.title === "string" ? raw.title.replace(/\p{Cc}/gu, "").trim() : "";
    if (title.length < 1 || title.length > NOTE_TITLE_MAX_LENGTH) {
      return { ok: false, error: `Dê um título à nota (até ${NOTE_TITLE_MAX_LENGTH} caracteres)` };
    }
    value.title = title;
  }
  if (raw.body !== undefined) {
    if (typeof raw.body !== "string" || raw.body.length > NOTE_BODY_MAX_LENGTH) {
      return { ok: false, error: `A nota pode ter até ${NOTE_BODY_MAX_LENGTH} caracteres` };
    }
    value.body = raw.body;
  }
  return { ok: true, value };
}

export class Notes {
  constructor(private db: Database.Database) {}

  list(): Note[] {
    const rows = this.db
      .prepare("SELECT id, title, body, updated_at FROM notes ORDER BY updated_at DESC, id DESC")
      .all() as Row[];
    return rows.map(toNote);
  }

  byId(id: number): Note | null {
    const row = this.db
      .prepare("SELECT id, title, body, updated_at FROM notes WHERE id = ?")
      .get(id) as Row | undefined;
    return row ? toNote(row) : null;
  }

  count(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM notes").get() as { n: number }).n;
  }

  create(input: NoteInput): Note {
    const result = this.db
      .prepare("INSERT INTO notes (title, body) VALUES (?, ?)")
      .run(input.title, input.body ?? "");
    return this.byId(Number(result.lastInsertRowid))!;
  }

  update(id: number, input: NoteInput): Note | null {
    const current = this.byId(id);
    if (!current) return null;
    this.db
      .prepare("UPDATE notes SET title = ?, body = ?, updated_at = datetime('now') WHERE id = ?")
      .run(input.title ?? current.title, input.body ?? current.body, id);
    return this.byId(id);
  }

  delete(id: number): boolean {
    return this.db.prepare("DELETE FROM notes WHERE id = ?").run(id).changes > 0;
  }
}

type Middleware = (req: Request, res: Response, next: NextFunction) => void;

const fail = (res: Response, status: number, error: string): void => {
  const body: ApiError = { error };
  res.status(status).json(body);
};

/** Notas privadas: só o mestre lê e escreve, e nada disso vai pelo socket. */
export function registerNoteRoutes(deps: {
  app: Express;
  notes: Notes;
  requireGm: Middleware;
}): void {
  const { app, notes, requireGm } = deps;

  app.get("/api/notes", requireGm, (_req, res) => {
    res.json(notes.list());
  });

  app.post("/api/notes", requireGm, (req, res) => {
    const parsed = parseNoteInput(req.body, true);
    if (!parsed.ok) return fail(res, 400, parsed.error);
    if (notes.count() >= NOTES_MAX) return fail(res, 409, "Notas demais. Apague algumas");
    res.status(201).json(notes.create(parsed.value));
  });

  app.patch("/api/notes/:id", requireGm, (req, res) => {
    const parsed = parseNoteInput(req.body, false);
    if (!parsed.ok) return fail(res, 400, parsed.error);
    const note = notes.update(Number(req.params.id), parsed.value);
    if (!note) return fail(res, 404, "Nota não encontrada");
    res.json(note);
  });

  app.delete("/api/notes/:id", requireGm, (req, res) => {
    if (!notes.delete(Number(req.params.id))) return fail(res, 404, "Nota não encontrada");
    res.status(204).end();
  });
}
