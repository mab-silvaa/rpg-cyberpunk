import type Database from "better-sqlite3";
import {
  GRID_PX_MAX,
  GRID_PX_MIN,
  SCENE_NAME_MAX_LENGTH,
  type SceneInput,
  type SceneSummary,
  type SceneView,
} from "@vtt/shared";
import { imageUrl, type Images } from "./images.js";

interface SceneRow {
  id: number;
  name: string;
  image_id: number | null;
  grid_px: number;
  meters_per_square: number;
  grid_visible: number;
  is_active: number;
  filename: string | null;
  width: number | null;
  height: number | null;
}

const SELECT = `
  SELECT s.id, s.name, s.image_id, s.grid_px, s.meters_per_square, s.grid_visible, s.is_active,
         i.filename, i.width, i.height
  FROM scenes s LEFT JOIN images i ON i.id = s.image_id`;

const toSummary = (row: SceneRow): SceneSummary => ({
  id: row.id,
  name: row.name,
  imageId: row.image_id,
  imageUrl: row.filename ? imageUrl(row.filename) : null,
  imageWidth: row.width,
  imageHeight: row.height,
  gridPx: row.grid_px,
  metersPerSquare: row.meters_per_square,
  gridVisible: row.grid_visible === 1,
  isActive: row.is_active === 1,
});

export const toView = (scene: SceneSummary): SceneView => ({
  id: scene.id,
  name: scene.name,
  imageUrl: scene.imageUrl,
  imageWidth: scene.imageWidth,
  imageHeight: scene.imageHeight,
  gridPx: scene.gridPx,
  metersPerSquare: scene.metersPerSquare,
  gridVisible: scene.gridVisible,
});

export type ParseResult = { ok: true; value: SceneInput } | { ok: false; error: string };

/** Valida o corpo de uma requisição de cena. Só aceita os campos conhecidos. */
export function parseSceneInput(body: unknown, requireName: boolean): ParseResult {
  const raw = (body ?? {}) as Record<string, unknown>;
  const value: SceneInput = {};

  if (raw.name !== undefined || requireName) {
    const name = typeof raw.name === "string" ? raw.name.replace(/\p{Cc}/gu, "").trim() : "";
    if (name.length < 1 || name.length > SCENE_NAME_MAX_LENGTH) {
      return { ok: false, error: `Dê um nome à cena (até ${SCENE_NAME_MAX_LENGTH} caracteres)` };
    }
    value.name = name;
  }
  if (raw.gridPx !== undefined) {
    const gridPx = raw.gridPx;
    if (
      typeof gridPx !== "number" ||
      !Number.isInteger(gridPx) ||
      gridPx < GRID_PX_MIN ||
      gridPx > GRID_PX_MAX
    ) {
      return {
        ok: false,
        error: `O quadrado do grid deve ter de ${GRID_PX_MIN} a ${GRID_PX_MAX} pixels`,
      };
    }
    value.gridPx = gridPx;
  }
  if (raw.metersPerSquare !== undefined) {
    const meters = raw.metersPerSquare;
    if (typeof meters !== "number" || !Number.isFinite(meters) || meters <= 0 || meters > 1000) {
      return { ok: false, error: "Os metros por quadrado devem ser um número maior que 0" };
    }
    value.metersPerSquare = meters;
  }
  if (raw.gridVisible !== undefined) {
    if (typeof raw.gridVisible !== "boolean")
      return { ok: false, error: "gridVisible deve ser verdadeiro ou falso" };
    value.gridVisible = raw.gridVisible;
  }
  if (raw.imageId !== undefined) {
    if (
      raw.imageId !== null &&
      (typeof raw.imageId !== "number" || !Number.isInteger(raw.imageId))
    ) {
      return { ok: false, error: "Imagem inválida" };
    }
    value.imageId = raw.imageId;
  }
  return { ok: true, value };
}

export class Scenes {
  constructor(
    private db: Database.Database,
    private images: Images,
  ) {}

  list(): SceneSummary[] {
    const rows = this.db.prepare(`${SELECT} ORDER BY s.position, s.id`).all();
    return (rows as SceneRow[]).map(toSummary);
  }

  byId(id: number): SceneSummary | null {
    const row = this.db.prepare(`${SELECT} WHERE s.id = ?`).get(id);
    return row ? toSummary(row as SceneRow) : null;
  }

  active(): SceneSummary | null {
    const row = this.db.prepare(`${SELECT} WHERE s.is_active = 1`).get();
    return row ? toSummary(row as SceneRow) : null;
  }

  /** Cria a cena. A primeira cena do jogo já nasce ativa. Devolve null se a imagem não existe. */
  create(input: SceneInput): SceneSummary | null {
    if (input.imageId != null && !this.images.byId(input.imageId)) return null;
    const first = this.db.prepare("SELECT COUNT(*) AS n FROM scenes").get() as { n: number };
    const next = this.db
      .prepare("SELECT COALESCE(MAX(position), 0) + 1 AS p FROM scenes")
      .get() as { p: number };
    const result = this.db
      .prepare(
        `INSERT INTO scenes (name, image_id, grid_px, meters_per_square, grid_visible, is_active, position)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.name,
        input.imageId ?? null,
        input.gridPx ?? 70,
        input.metersPerSquare ?? 2,
        input.gridVisible === false ? 0 : 1,
        first.n === 0 ? 1 : 0,
        next.p,
      );
    return this.byId(Number(result.lastInsertRowid));
  }

  /** Devolve a cena atualizada, "image" se a imagem não existe, ou null se a cena não existe. */
  update(id: number, input: SceneInput): SceneSummary | "image" | null {
    const current = this.byId(id);
    if (!current) return null;
    if (input.imageId != null && !this.images.byId(input.imageId)) return "image";

    this.db
      .prepare(
        `UPDATE scenes SET name = ?, image_id = ?, grid_px = ?, meters_per_square = ?, grid_visible = ? WHERE id = ?`,
      )
      .run(
        input.name ?? current.name,
        input.imageId === undefined ? current.imageId : input.imageId,
        input.gridPx ?? current.gridPx,
        input.metersPerSquare ?? current.metersPerSquare,
        (input.gridVisible ?? current.gridVisible) ? 1 : 0,
        id,
      );
    if (input.imageId !== undefined && input.imageId !== current.imageId) {
      this.images.deleteIfUnused(current.imageId);
    }
    return this.byId(id);
  }

  /** Torna a cena a única ativa. Devolve false se ela não existe. */
  activate(id: number): boolean {
    if (!this.byId(id)) return false;
    this.db.transaction(() => {
      this.db.prepare("UPDATE scenes SET is_active = 0 WHERE is_active = 1").run();
      this.db.prepare("UPDATE scenes SET is_active = 1 WHERE id = ?").run(id);
    })();
    return true;
  }

  delete(id: number): boolean {
    const scene = this.byId(id);
    if (!scene) return false;
    // Os tokens da cena somem junto; as imagens deles, se ninguém mais usa, também.
    const tokenImages = this.db
      .prepare("SELECT DISTINCT image_id FROM tokens WHERE scene_id = ? AND image_id IS NOT NULL")
      .all(id) as { image_id: number }[];
    this.db.prepare("DELETE FROM scenes WHERE id = ?").run(id);
    this.images.deleteIfUnused(scene.imageId);
    for (const { image_id } of tokenImages) this.images.deleteIfUnused(image_id);
    return true;
  }
}
