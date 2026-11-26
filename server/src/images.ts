import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type Database from "better-sqlite3";
import { imageSize } from "image-size";
import { MAX_IMAGE_SIDE, type ImageInfo } from "@vtt/shared";

interface ImageRow {
  id: number;
  filename: string;
  width: number;
  height: number;
}

const FORMATS: Record<string, { ext: string; mime: string }> = {
  png: { ext: "png", mime: "image/png" },
  jpg: { ext: "jpg", mime: "image/jpeg" },
  webp: { ext: "webp", mime: "image/webp" },
};

export type SaveResult = { ok: true; image: ImageInfo } | { ok: false; error: string };

export const imageUrl = (filename: string): string => `/uploads/${filename}`;

export class Images {
  constructor(
    private db: Database.Database,
    readonly dir: string,
  ) {
    fs.mkdirSync(dir, { recursive: true });
  }

  /** Confere o conteúdo (não o nome nem o tipo informado pelo navegador) e grava o arquivo. */
  save(buffer: Buffer, originalName: string): SaveResult {
    let detected: ReturnType<typeof imageSize>;
    try {
      detected = imageSize(buffer);
    } catch {
      return { ok: false, error: "Esse arquivo não é uma imagem PNG, JPG ou WebP" };
    }
    const format = detected.type ? FORMATS[detected.type] : undefined;
    if (!format || !detected.width || !detected.height) {
      return { ok: false, error: "Use uma imagem PNG, JPG ou WebP" };
    }
    if (detected.width > MAX_IMAGE_SIDE || detected.height > MAX_IMAGE_SIDE) {
      return {
        ok: false,
        error: `A imagem tem ${detected.width}×${detected.height} px. O máximo é ${MAX_IMAGE_SIDE} px de lado; reduza e envie de novo`,
      };
    }

    const filename = `${crypto.randomUUID()}.${format.ext}`;
    fs.writeFileSync(path.join(this.dir, filename), buffer);
    const result = this.db
      .prepare(
        "INSERT INTO images (filename, original_name, mime, width, height, size) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        filename,
        originalName.slice(0, 200),
        format.mime,
        detected.width,
        detected.height,
        buffer.length,
      );
    return {
      ok: true,
      image: {
        id: Number(result.lastInsertRowid),
        url: imageUrl(filename),
        width: detected.width,
        height: detected.height,
      },
    };
  }

  byId(id: number): ImageRow | null {
    const row = this.db
      .prepare("SELECT id, filename, width, height FROM images WHERE id = ?")
      .get(id);
    return (row as ImageRow | undefined) ?? null;
  }

  /** Apaga a imagem (registro e arquivo) se nenhuma cena nem token a usa mais. */
  deleteIfUnused(id: number | null): void {
    if (id === null) return;
    const used =
      this.db.prepare("SELECT 1 FROM scenes WHERE image_id = ? LIMIT 1").get(id) ??
      this.db.prepare("SELECT 1 FROM tokens WHERE image_id = ? LIMIT 1").get(id);
    if (used) return;
    this.remove(id);
  }

  /** Apaga imagens enviadas há mais de `olderThanMs` que nenhuma cena nem token usa (uploads abandonados). */
  sweepOrphans(olderThanMs: number): number {
    const cutoff = new Date(Date.now() - olderThanMs).toISOString().slice(0, 19).replace("T", " ");
    const rows = this.db
      .prepare(
        `SELECT id FROM images WHERE created_at < ?
           AND id NOT IN (SELECT image_id FROM scenes WHERE image_id IS NOT NULL)
           AND id NOT IN (SELECT image_id FROM tokens WHERE image_id IS NOT NULL)`,
      )
      .all(cutoff) as { id: number }[];
    for (const { id } of rows) this.remove(id);
    return rows.length;
  }

  private remove(id: number): void {
    const row = this.byId(id);
    if (!row) return;
    this.db.prepare("DELETE FROM images WHERE id = ?").run(id);
    fs.rmSync(path.join(this.dir, row.filename), { force: true });
  }
}
