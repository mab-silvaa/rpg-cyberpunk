import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { Server, type Socket } from "socket.io";
import type Database from "better-sqlite3";
import type {
  ApiError,
  ClientToServerEvents,
  HealthResponse,
  LoginRequest,
  LoginResponse,
  PresenceUser,
  ServerToClientEvents,
  SocketData,
  TunnelInfo,
  User,
} from "@vtt/shared";
import type { Config } from "./config.js";
import {
  createSessionToken,
  FailureLimiter,
  parseCookies,
  passwordMatches,
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
  verifySessionToken,
} from "./session.js";
import { normalizeName, Presence, Users } from "./users.js";
import { Images } from "./images.js";
import { registerMapRoutes, registerMapSocket, snapshotFor } from "./map.js";
import { Scenes } from "./scenes.js";
import {
  CharacterHub,
  Characters,
  registerCharacterRoutes,
  registerCharacterSocket,
} from "./characters.js";
import { registerDiceSocket, Rolls } from "./dice.js";
import { Fog, registerFogRoutes } from "./fog.js";
import { registerTokenRoutes, registerTokenSocket, TokenHub, Tokens } from "./tokens.js";

export type VttServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export type VttSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export interface AppContext {
  httpServer: http.Server;
  io: VttServer;
  close: () => Promise<void>;
}

const fail = (res: Response, status: number, error: string): void => {
  const body: ApiError = { error };
  res.status(status).json(body);
};

export function createApp(config: Config, db: Database.Database): AppContext {
  const app = express();
  if (config.trustProxy) app.set("trust proxy", 1);
  app.use(express.json({ limit: "10kb" }));

  const users = new Users(db);
  const presence = new Presence();
  const gmLimiter = new FailureLimiter();

  const userFromCookie = (header: string | undefined): User | null => {
    const token = parseCookies(header)[SESSION_COOKIE];
    const id = token ? verifySessionToken(token, config.sessionSecret) : null;
    return id === null ? null : users.byId(id);
  };

  const requireUser = (req: Request, res: Response, next: NextFunction): void => {
    const user = userFromCookie(req.headers.cookie);
    if (!user) return fail(res, 401, "Entre com seu nome para continuar");
    users.touch(user.id);
    res.locals.user = user;
    next();
  };

  const requireGm = (req: Request, res: Response, next: NextFunction): void => {
    requireUser(req, res, () => {
      if (!(res.locals.user as User).isGm) return fail(res, 403, "Só o mestre pode fazer isso");
      next();
    });
  };

  const presenceList = (): PresenceUser[] =>
    users.list().map((user) => ({ ...user, online: presence.isOnline(user.id) }));

  const images = new Images(db, path.join(config.dataDir, "uploads"));
  const scenes = new Scenes(db, images);
  const fog = new Fog(db);
  const rolls = new Rolls(db);
  const characters = new Characters(db, users);
  const tokens = new Tokens(db, images, scenes, users, fog);
  // Uploads que o mestre enviou e nunca usou numa cena não ficam para sempre.
  images.sweepOrphans(24 * 60 * 60 * 1000);

  const httpServer = http.createServer(app);
  const io: VttServer = new Server(httpServer);
  const tokenHub = new TokenHub(io, tokens);
  const characterHub = new CharacterHub(io);
  // Mudou a ficha: os tokens ligados a ela mostram o HP novo.
  const onCharacterChanged = (id: number, tokenIds?: number[]): void => {
    for (const tokenId of tokenIds ?? tokens.byCharacter(id).map((t) => t.id)) {
      const token = tokens.byId(tokenId);
      if (token) tokenHub.upsert(token);
    }
  };
  const broadcastPresence = (): void => {
    io.emit("presence:update", presenceList());
  };

  app.get("/api/health", (_req, res) => {
    db.prepare("SELECT 1").get();
    const body: HealthResponse = { status: "ok", version: config.version };
    res.json(body);
  });

  app.post("/api/login", (req, res) => {
    const body = (req.body ?? {}) as Partial<LoginRequest>;
    const name = normalizeName(body.name);
    if (!name) return fail(res, 400, "Digite um nome de 1 a 32 caracteres");

    let user: User;
    if (body.gm) {
      if (!config.gmPassword) return fail(res, 503, "A senha do mestre não foi configurada");
      if (gmLimiter.isBlocked(req.ip ?? "")) {
        return fail(res, 429, "Muitas tentativas. Espere um minuto e tente de novo");
      }
      if (typeof body.password !== "string" || !passwordMatches(body.password, config.gmPassword)) {
        gmLimiter.recordFailure(req.ip ?? "");
        return fail(res, 401, "Senha do mestre incorreta");
      }
      const existing = users.byName(name);
      if (existing) {
        if (!existing.isGm) users.promoteToGm(existing.id);
        user = { ...existing, isGm: true };
      } else {
        user = users.create(name, true);
      }
    } else {
      const existing = users.byName(name);
      if (existing?.isGm) return fail(res, 403, "Esse nome é do mestre. Escolha outro");
      if (existing) {
        const current = userFromCookie(req.headers.cookie);
        if (presence.isOnline(existing.id) && current?.id !== existing.id) {
          return fail(res, 409, "Esse nome já está em uso por alguém conectado");
        }
        user = existing;
      } else {
        user = users.create(name, false);
      }
    }

    res.cookie(SESSION_COOKIE, createSessionToken(user.id, config.sessionSecret), {
      httpOnly: true,
      sameSite: "lax",
      secure: req.secure,
      maxAge: SESSION_MAX_AGE_MS,
      path: "/",
    });
    const response: LoginResponse = { user };
    res.json(response);
    broadcastPresence();
  });

  app.post("/api/logout", (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.status(204).end();
  });

  app.get("/api/me", requireUser, (_req, res) => {
    res.json({ user: res.locals.user as User });
  });

  app.get("/api/users", requireUser, (_req, res) => {
    res.json(presenceList());
  });

  app.patch("/api/users/:id", requireGm, (req, res) => {
    const id = Number(req.params.id);
    const name = normalizeName((req.body as { name?: unknown } | undefined)?.name);
    if (!users.byId(id)) return fail(res, 404, "Usuário não encontrado");
    if (!name) return fail(res, 400, "Digite um nome de 1 a 32 caracteres");
    if (!users.rename(id, name)) return fail(res, 409, "Esse nome já está em uso");
    res.json(presenceList());
    broadcastPresence();
  });

  app.delete("/api/users/:id", requireGm, (req, res) => {
    const id = Number(req.params.id);
    if (id === (res.locals.user as User).id)
      return fail(res, 400, "Você não pode expulsar a si mesmo");
    if (!users.byId(id)) return fail(res, 404, "Usuário não encontrado");
    const orphaned = characters.ownedBy(id).map((c) => c.id);
    users.delete(id);
    io.in(`user:${id}`).disconnectSockets(true);
    res.status(204).end();
    broadcastPresence();
    // Os tokens e as fichas dele(a) ficam sem dono; o mestre precisa ver isso.
    for (const characterId of orphaned) {
      const c = characters.byId(characterId);
      if (c) characterHub.update(c);
    }
    tokenHub.resync();
  });

  app.get("/api/tunnel", requireGm, async (_req, res) => {
    const info = await readTunnel(config.tunnelMetricsUrl);
    res.json(info);
  });

  const { clearRulers, rulers } = registerMapRoutes({
    app,
    config,
    images,
    scenes,
    requireUser,
    requireGm,
    emitScene: (scene) => {
      // Ao trocar de cena, as réguas da cena antiga somem.
      clearRulers();
      fog.invalidate();
      io.emit("scene:update", scene);
      const active = scenes.active();
      const activeFog = active ? fog.state(active.id) : null;
      if (activeFog) io.to("players").emit("fog:set", activeFog);
      tokenHub.resync();
    },
  });
  registerTokenRoutes({ app, tokens, hub: tokenHub, requireGm });
  registerCharacterRoutes({
    app,
    characters,
    hub: characterHub,
    requireUser,
    requireGm,
    onChanged: onCharacterChanged,
    tokenIdsOf: (id) => tokens.byCharacter(id).map((t) => t.id),
  });
  registerFogRoutes({
    app,
    fog,
    requireGm,
    onSet: (state) => {
      io.to("gm").emit("fog:set", state);
      if (scenes.active()?.id === state.sceneId) io.to("players").emit("fog:set", state);
      tokenHub.refresh();
    },
    onAdd: (sceneId, shape) => {
      io.to("gm").emit("fog:add", sceneId, shape);
      if (scenes.active()?.id === sceneId) io.to("players").emit("fog:add", sceneId, shape);
      tokenHub.refresh();
    },
  });

  // Em produção o servidor entrega o front compilado; em desenvolvimento o Vite cuida disso.
  if (fs.existsSync(config.clientDir)) {
    app.use(express.static(config.clientDir));
    app.get("/{*splat}", (_req, res) => res.sendFile(path.join(config.clientDir, "index.html")));
  }

  io.use((socket, next) => {
    const user = userFromCookie(socket.handshake.headers.cookie);
    if (!user) return next(new Error("unauthorized"));
    socket.data.user = user;
    next();
  });

  io.on("connection", (socket) => {
    const { user } = socket.data;
    void socket.join(`user:${user.id}`);
    void socket.join(user.isGm ? "gm" : "players");
    presence.add(user.id, socket.id);
    socket.emit("server:hello", { version: config.version, user });
    const activeFog = scenes.active() ? fog.state(scenes.active()!.id) : null;
    socket.emit(
      "state:snapshot",
      snapshotFor(
        scenes.active(),
        rulers,
        tokenHub.attach(socket),
        user.isGm ? fog.all() : activeFog ? [activeFog] : [],
        rolls.recent(user.isGm),
        characters.forUser(user),
      ),
    );
    registerMapSocket(socket, rulers);
    registerTokenSocket(socket, tokens, tokenHub);
    registerDiceSocket(socket, io, rolls);
    registerCharacterSocket(socket, characters, characterHub, onCharacterChanged);
    broadcastPresence();

    socket.on("echo:ping", (message, ack) => {
      ack({ message, receivedAt: Date.now() });
    });
    socket.on("disconnect", () => {
      presence.remove(user.id, socket.id);
      broadcastPresence();
    });
  });

  return {
    httpServer,
    io,
    close: async () => {
      await io.close();
      if (httpServer.listening) {
        await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      }
    },
  };
}

/** Pergunta ao cloudflared qual é o link público atual do quick tunnel. */
async function readTunnel(metricsUrl: string | undefined): Promise<TunnelInfo> {
  if (!metricsUrl) return { url: null, error: "Nenhum tunnel configurado (rodando sem Docker?)" };
  try {
    const res = await fetch(metricsUrl, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return { url: null, error: `O tunnel respondeu ${res.status}` };
    const { hostname } = (await res.json()) as { hostname?: string };
    return hostname
      ? { url: `https://${hostname}` }
      : { url: null, error: "O tunnel ainda está iniciando. Tente de novo em instantes" };
  } catch {
    return { url: null, error: "Não consegui falar com o tunnel" };
  }
}
