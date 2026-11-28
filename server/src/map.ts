import type { Express, NextFunction, Request, Response } from "express";
import express from "express";
import multer from "multer";
import type {
  ApiError,
  ImageInfo,
  RulerLine,
  RulerState,
  SceneSummary,
  SceneView,
  CharacterView,
  FogState,
  InitiativeView,
  RollResult,
  StateSnapshot,
  TokenView,
} from "@vtt/shared";
import type { VttSocket } from "./app.js";
import type { Config } from "./config.js";
import type { Images } from "./images.js";
import { parseSceneInput, toView, type Scenes } from "./scenes.js";

type Middleware = (req: Request, res: Response, next: NextFunction) => void;

export interface MapDeps {
  app: Express;
  config: Config;
  images: Images;
  scenes: Scenes;
  requireUser: Middleware;
  requireGm: Middleware;
  /** Avisa todos os conectados de que a cena ativa mudou. */
  emitScene: (scene: SceneView | null) => void;
}

const fail = (res: Response, status: number, error: string): void => {
  const body: ApiError = { error };
  res.status(status).json(body);
};

/** Rotas HTTP de imagens e cenas. Só o mestre cria e altera; qualquer um logado baixa as imagens. */
export function registerMapRoutes(deps: MapDeps): {
  clearRulers: () => void;
  rulers: Map<string, RulerState>;
} {
  const { app, config, images, scenes, requireUser, requireGm } = deps;
  const rulers = new Map<string, RulerState>();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: Math.floor(config.maxUploadMb * 1024 * 1024), files: 1 },
  }).single("file");

  app.use(
    "/uploads",
    requireUser,
    express.static(images.dir, {
      immutable: true,
      maxAge: "30d",
      fallthrough: false,
      setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
    }),
  );

  app.post("/api/images", requireGm, (req, res) => {
    upload(req, res, (error: unknown) => {
      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        return fail(res, 413, `Imagem grande demais. O máximo é ${config.maxUploadMb} MB`);
      }
      if (error) return fail(res, 400, "Não consegui ler o envio");
      if (!req.file) return fail(res, 400, "Escolha uma imagem para enviar");

      const saved = images.save(req.file.buffer, req.file.originalname);
      if (!saved.ok) return fail(res, 415, saved.error);
      const body: ImageInfo = saved.image;
      res.status(201).json(body);
    });
  });

  const afterChange = (res: Response, status = 200): void => {
    deps.emitScene(scenes.active() ? toView(scenes.active()!) : null);
    res.status(status).json(scenes.list());
  };

  app.get("/api/scenes", requireGm, (_req, res) => {
    res.json(scenes.list());
  });

  app.post("/api/scenes", requireGm, (req, res) => {
    const parsed = parseSceneInput(req.body, true);
    if (!parsed.ok) return fail(res, 400, parsed.error);
    const scene = scenes.create(parsed.value);
    if (!scene) return fail(res, 400, "Essa imagem não existe mais. Envie de novo");
    afterChange(res, 201);
  });

  app.patch("/api/scenes/:id", requireGm, (req, res) => {
    const parsed = parseSceneInput(req.body, false);
    if (!parsed.ok) return fail(res, 400, parsed.error);
    const result = scenes.update(Number(req.params.id), parsed.value);
    if (result === null) return fail(res, 404, "Cena não encontrada");
    if (result === "image") return fail(res, 400, "Essa imagem não existe mais. Envie de novo");
    afterChange(res);
  });

  app.post("/api/scenes/:id/activate", requireGm, (req, res) => {
    if (!scenes.activate(Number(req.params.id))) return fail(res, 404, "Cena não encontrada");
    rulers.clear();
    afterChange(res);
  });

  app.delete("/api/scenes/:id", requireGm, (req, res) => {
    if (!scenes.delete(Number(req.params.id))) return fail(res, 404, "Cena não encontrada");
    afterChange(res);
  });

  return { clearRulers: () => rulers.clear(), rulers };
}

const COORD_LIMIT = 1e6;
const isCoord = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= COORD_LIMIT;

/** Valida uma régua vinda do navegador; devolve null se algum valor não presta. */
export function parseRuler(raw: unknown): RulerLine | null {
  const line = raw as Partial<RulerLine> | null;
  if (!line || !isCoord(line.x1) || !isCoord(line.y1) || !isCoord(line.x2) || !isCoord(line.y2))
    return null;
  return { x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2 };
}

export function snapshotFor(
  scene: SceneSummary | null,
  rulers: Map<string, RulerState>,
  tokens: TokenView[],
  fogs: FogState[],
  rolls: RollResult[],
  characters: CharacterView[],
  initiative: InitiativeView,
): StateSnapshot {
  return {
    scene: scene ? toView(scene) : null,
    rulers: [...rulers.values()],
    tokens,
    fogs,
    rolls,
    characters,
    initiative,
  };
}

/** Eventos de mapa por conexão: régua. */
export function registerMapSocket(socket: VttSocket, rulers: Map<string, RulerState>): void {
  const { user } = socket.data;
  socket.on("ruler:update", (raw) => {
    const line = raw === null ? null : parseRuler(raw);
    if (raw !== null && !line) return;
    if (line) {
      const state: RulerState = { ...line, userId: user.id, name: user.name };
      rulers.set(socket.id, state);
      socket.broadcast.emit("ruler:update", user.id, state);
    } else if (rulers.delete(socket.id)) {
      socket.broadcast.emit("ruler:update", user.id, null);
    }
  });
  socket.on("disconnect", () => {
    if (rulers.delete(socket.id)) socket.broadcast.emit("ruler:update", user.id, null);
  });
}
