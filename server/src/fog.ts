import type { Express, NextFunction, Request, Response } from "express";
import type Database from "better-sqlite3";
import {
  FOG_BRUSH_MAX,
  FOG_BRUSH_MIN,
  FOG_MAX_BRUSH_POINTS,
  FOG_MAX_SHAPES,
  type ApiError,
  type FogMode,
  type FogShape,
  type FogShapeInput,
  type FogState,
} from "@vtt/shared";

const COORD_LIMIT = 1e6;
const isCoord = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= COORD_LIMIT;

export type ParseResult = { ok: true; value: FogShapeInput } | { ok: false; error: string };

/** Valida uma forma de fog vinda do navegador. */
export function parseFogShape(body: unknown): ParseResult {
  const raw = (body ?? {}) as Record<string, unknown>;
  const mode = raw.mode as FogMode;
  if (mode !== "reveal" && mode !== "cover") return { ok: false, error: "Modo de fog inválido" };

  if (raw.kind === "rect") {
    const { x, y, w, h } = raw;
    if (!isCoord(x) || !isCoord(y) || !isCoord(w) || !isCoord(h) || w <= 0 || h <= 0) {
      return { ok: false, error: "Retângulo de fog inválido" };
    }
    return { ok: true, value: { kind: "rect", mode, x, y, w, h } };
  }
  if (raw.kind === "brush") {
    const { size, points } = raw;
    if (!isCoord(size) || size < FOG_BRUSH_MIN || size > FOG_BRUSH_MAX) {
      return { ok: false, error: "Tamanho de pincel inválido" };
    }
    if (
      !Array.isArray(points) ||
      points.length < 2 ||
      points.length % 2 !== 0 ||
      points.length > FOG_MAX_BRUSH_POINTS * 2 ||
      !points.every(isCoord)
    ) {
      return { ok: false, error: "Traço de pincel inválido" };
    }
    return { ok: true, value: { kind: "brush", mode, size, points: points as number[] } };
  }
  return { ok: false, error: "Forma de fog inválida" };
}

interface ShapeRow {
  id: number;
  mode: FogMode;
  shape: string;
}

const toShape = (row: ShapeRow): FogShape =>
  ({ ...(JSON.parse(row.shape) as object), id: row.id, mode: row.mode }) as FogShape;

/** Fog de cada cena. As formas ficam em memória depois da primeira leitura. */
export class Fog {
  private cache = new Map<number, FogState>();

  constructor(private db: Database.Database) {}

  /** Esquece o cache (por exemplo, depois de apagar uma cena). */
  invalidate(): void {
    this.cache.clear();
  }

  state(sceneId: number): FogState | null {
    const cached = this.cache.get(sceneId);
    if (cached) return cached;
    const scene = this.db.prepare("SELECT fog_enabled FROM scenes WHERE id = ?").get(sceneId) as
      { fog_enabled: number } | undefined;
    if (!scene) return null;
    const rows = this.db
      .prepare("SELECT id, mode, shape FROM fog_shapes WHERE scene_id = ? ORDER BY id")
      .all(sceneId) as ShapeRow[];
    const state: FogState = {
      sceneId,
      enabled: scene.fog_enabled === 1,
      shapes: rows.map(toShape),
    };
    this.cache.set(sceneId, state);
    return state;
  }

  all(): FogState[] {
    const ids = this.db.prepare("SELECT id FROM scenes ORDER BY position, id").all() as {
      id: number;
    }[];
    return ids.map(({ id }) => this.state(id)!);
  }

  setEnabled(sceneId: number, enabled: boolean): FogState | null {
    if (!this.state(sceneId)) return null;
    this.db.prepare("UPDATE scenes SET fog_enabled = ? WHERE id = ?").run(enabled ? 1 : 0, sceneId);
    this.cache.delete(sceneId);
    return this.state(sceneId);
  }

  /** Acrescenta uma forma. Devolve "scene" se a cena não existe ou "limit" se passou do máximo. */
  add(sceneId: number, input: FogShapeInput): FogShape | "scene" | "limit" {
    const state = this.state(sceneId);
    if (!state) return "scene";
    if (state.shapes.length >= FOG_MAX_SHAPES) return "limit";
    const { mode, ...geometry } = input;
    const result = this.db
      .prepare("INSERT INTO fog_shapes (scene_id, mode, shape) VALUES (?, ?, ?)")
      .run(sceneId, mode, JSON.stringify(geometry));
    const shape = { ...input, id: Number(result.lastInsertRowid) } as FogShape;
    // Mantém o cache em dia sem reler tudo.
    this.cache.set(sceneId, { ...state, shapes: [...state.shapes, shape] });
    return shape;
  }

  /** Desfaz a última forma. */
  undo(sceneId: number): FogState | null {
    if (!this.state(sceneId)) return null;
    this.db
      .prepare(
        "DELETE FROM fog_shapes WHERE id = (SELECT MAX(id) FROM fog_shapes WHERE scene_id = ?)",
      )
      .run(sceneId);
    this.cache.delete(sceneId);
    return this.state(sceneId);
  }

  /** Cobre tudo: apaga as formas, e sem formas tudo fica coberto. */
  coverAll(sceneId: number): FogState | null {
    if (!this.state(sceneId)) return null;
    this.db.prepare("DELETE FROM fog_shapes WHERE scene_id = ?").run(sceneId);
    this.cache.delete(sceneId);
    return this.state(sceneId);
  }

  /** Revela tudo: troca as formas por um retângulo que cobre o mapa inteiro. */
  revealAll(sceneId: number): FogState | null {
    if (!this.state(sceneId)) return null;
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM fog_shapes WHERE scene_id = ?").run(sceneId);
      this.db.prepare("INSERT INTO fog_shapes (scene_id, mode, shape) VALUES (?, 'reveal', ?)").run(
        sceneId,
        JSON.stringify({
          kind: "rect",
          x: -COORD_LIMIT,
          y: -COORD_LIMIT,
          w: 2 * COORD_LIMIT,
          h: 2 * COORD_LIMIT,
        }),
      );
    })();
    this.cache.delete(sceneId);
    return this.state(sceneId);
  }
}

type Middleware = (req: Request, res: Response, next: NextFunction) => void;

const fail = (res: Response, status: number, error: string): void => {
  const body: ApiError = { error };
  res.status(status).json(body);
};

/** Rotas HTTP de fog. Só o mestre mexe. */
export function registerFogRoutes(deps: {
  app: Express;
  fog: Fog;
  requireGm: Middleware;
  /** Avisa que a fog inteira da cena mudou. */
  onSet: (state: FogState) => void;
  /** Avisa que uma forma foi acrescentada. */
  onAdd: (sceneId: number, shape: FogShape) => void;
}): void {
  const { app, fog, requireGm } = deps;
  const notFound = (res: Response): void => fail(res, 404, "Cena não encontrada");
  const done = (res: Response, state: FogState | null): void => {
    if (!state) return notFound(res);
    deps.onSet(state);
    res.json(state);
  };

  app.get("/api/scenes/:id/fog", requireGm, (req, res) => {
    const state = fog.state(Number(req.params.id));
    if (!state) return notFound(res);
    res.json(state);
  });

  app.patch("/api/scenes/:id/fog", requireGm, (req, res) => {
    const enabled = (req.body as { enabled?: unknown } | undefined)?.enabled;
    if (typeof enabled !== "boolean") return fail(res, 400, "enabled deve ser verdadeiro ou falso");
    done(res, fog.setEnabled(Number(req.params.id), enabled));
  });

  app.post("/api/scenes/:id/fog/shapes", requireGm, (req, res) => {
    const parsed = parseFogShape(req.body);
    if (!parsed.ok) return fail(res, 400, parsed.error);
    const sceneId = Number(req.params.id);
    const shape = fog.add(sceneId, parsed.value);
    if (shape === "scene") return notFound(res);
    if (shape === "limit") {
      return fail(
        res,
        409,
        'Fog com formas demais. Use "Cobrir tudo" ou "Revelar tudo" para recomeçar',
      );
    }
    deps.onAdd(sceneId, shape);
    res.status(201).json(shape);
  });

  app.delete("/api/scenes/:id/fog/shapes/last", requireGm, (req, res) => {
    done(res, fog.undo(Number(req.params.id)));
  });
  app.post("/api/scenes/:id/fog/cover-all", requireGm, (req, res) => {
    done(res, fog.coverAll(Number(req.params.id)));
  });
  app.post("/api/scenes/:id/fog/reveal-all", requireGm, (req, res) => {
    done(res, fog.revealAll(Number(req.params.id)));
  });
}
