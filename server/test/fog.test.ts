import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isFogged,
  type ApiError,
  type ClientToServerEvents,
  type FogShape,
  type FogShapeInput,
  type FogState,
  type ImageInfo,
  type LoginResponse,
  type SceneSummary,
  type ServerToClientEvents,
  type StateSnapshot,
  type TokenView,
} from "@vtt/shared";
import { api, pngHeader, startServer, uploadForm, type TestServer } from "./helpers.js";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let server: TestServer;
let gm: string;
let rita: string;
let ritaId: number;
let scene: SceneSummary;
const clients: Client[] = [];

beforeEach(async () => {
  server = await startServer();
  gm = (
    await api(server, "POST", "/api/login", {
      body: { name: "Mestre", gm: true, password: "senha-do-mestre" },
    })
  ).cookie!;
  const r = await api<LoginResponse>(server, "POST", "/api/login", { body: { name: "Rita" } });
  rita = r.cookie!;
  ritaId = r.body.user.id;
  const image = await api<ImageInfo>(server, "POST", "/api/images", {
    cookie: gm,
    form: uploadForm(pngHeader(1000, 800)),
  });
  scene = (
    await api<SceneSummary[]>(server, "POST", "/api/scenes", {
      cookie: gm,
      body: { name: "Telhado", imageId: image.body.id },
    })
  ).body[0]!;
});
afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect();
  await server.stop();
});

const fogApi = (method: string, route: string, body?: unknown, cookie = gm) =>
  api<FogState & FogShape & ApiError>(server, method, `/api/scenes/${scene.id}/fog${route}`, {
    cookie,
    body,
  });
const rect = (x: number, y: number, w: number, h: number, mode = "reveal"): FogShapeInput =>
  ({ kind: "rect", mode, x, y, w, h }) as FogShapeInput;
const makeToken = (name: string, x: number, y: number, extra: object = {}) =>
  api<TokenView>(server, "POST", "/api/tokens", {
    cookie: gm,
    body: { sceneId: scene.id, name, x, y, ...extra },
  });

async function open(cookie: string): Promise<{ client: Client; snapshot: StateSnapshot }> {
  const client: Client = connect(server.url, {
    transports: ["websocket"],
    extraHeaders: { cookie },
    reconnection: false,
  });
  clients.push(client);
  const snapshot = await new Promise<StateSnapshot>((resolve) =>
    client.once("state:snapshot", resolve),
  );
  return { client, snapshot };
}

function record<E extends keyof ServerToClientEvents>(client: Client, event: E) {
  const received: Parameters<ServerToClientEvents[E]>[] = [];
  client.on(event, ((...args: Parameters<ServerToClientEvents[E]>) => {
    received.push(args);
  }) as never);
  return received;
}
const settle = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));

describe("geometria da fog", () => {
  const shapes = (...list: FogShapeInput[]): FogShape[] =>
    list.map((shape, i) => ({ ...shape, id: i + 1 }) as FogShape);

  it("sem fog ligada nada fica coberto; ligada e sem formas, tudo", () => {
    expect(isFogged({ enabled: false, shapes: [] }, 5, 5)).toBe(false);
    expect(isFogged({ enabled: true, shapes: [] }, 5, 5)).toBe(true);
  });

  it("retângulo revela e a ordem decide: a última forma que toca o ponto vence", () => {
    const fog = {
      enabled: true,
      shapes: shapes(
        { kind: "rect", mode: "reveal", x: 0, y: 0, w: 100, h: 100 },
        { kind: "rect", mode: "cover", x: 40, y: 40, w: 20, h: 20 },
        { kind: "rect", mode: "reveal", x: 50, y: 50, w: 5, h: 5 },
      ),
    };
    expect(isFogged(fog, 10, 10)).toBe(false);
    expect(isFogged(fog, 45, 45)).toBe(true);
    expect(isFogged(fog, 52, 52)).toBe(false);
    expect(isFogged(fog, 150, 10)).toBe(true);
  });

  it("pincel revela uma faixa em volta do traço, com pontas redondas", () => {
    const fog = {
      enabled: true,
      shapes: shapes({ kind: "brush", mode: "reveal", size: 20, points: [0, 0, 100, 0, 100, 100] }),
    };
    expect(isFogged(fog, 50, 9)).toBe(false);
    expect(isFogged(fog, 50, 11)).toBe(true);
    expect(isFogged(fog, 109, 50)).toBe(false);
    expect(isFogged(fog, 50, 50)).toBe(true);
    expect(isFogged(fog, -9, 0)).toBe(false);
    expect(isFogged(fog, -11, 0)).toBe(true);
    const dot = {
      enabled: true,
      shapes: shapes({ kind: "brush", mode: "reveal", size: 10, points: [30, 30] }),
    };
    expect(isFogged(dot, 33, 33)).toBe(false);
    expect(isFogged(dot, 40, 40)).toBe(true);
  });
});

describe("rotas da fog", () => {
  it("só o mestre vê e mexe", async () => {
    expect((await fogApi("GET", "", undefined, rita)).status).toBe(403);
    expect((await fogApi("PATCH", "", { enabled: true }, rita)).status).toBe(403);
    expect((await fogApi("POST", "/shapes", rect(0, 0, 5, 5), rita)).status).toBe(403);
    expect((await fogApi("DELETE", "/shapes/last", undefined, rita)).status).toBe(403);
    expect((await fogApi("POST", "/cover-all", undefined, rita)).status).toBe(403);
    expect((await fogApi("POST", "/reveal-all", undefined, rita)).status).toBe(403);
  });

  it("nasce desligada e vazia; liga, acrescenta, desfaz, cobre e revela tudo", async () => {
    expect((await fogApi("GET", "")).body).toMatchObject({ enabled: false, shapes: [] });
    expect((await fogApi("PATCH", "", { enabled: true })).body.enabled).toBe(true);

    const a = await fogApi("POST", "/shapes", rect(0, 0, 100, 100));
    const b = await fogApi("POST", "/shapes", {
      kind: "brush",
      mode: "cover",
      size: 30,
      points: [1, 2, 3, 4],
    });
    expect(a.status).toBe(201);
    expect(b.body).toMatchObject({ kind: "brush", mode: "cover", size: 30 });
    expect((await fogApi("GET", "")).body.shapes.map((s) => s.id)).toEqual([a.body.id, b.body.id]);

    expect((await fogApi("DELETE", "/shapes/last")).body.shapes.map((s) => s.id)).toEqual([
      a.body.id,
    ]);
    const revealed = (await fogApi("POST", "/reveal-all")).body;
    expect(revealed.shapes).toHaveLength(1);
    expect(isFogged(revealed, 500, 400)).toBe(false);
    expect(isFogged(revealed, -5000, 99999)).toBe(false);
    const covered = (await fogApi("POST", "/cover-all")).body;
    expect(covered.shapes).toEqual([]);
    expect(isFogged(covered, 500, 400)).toBe(true);
  });

  it("recusa formas inválidas e cena inexistente", async () => {
    for (const body of [
      {},
      { kind: "rect", mode: "reveal", x: 0, y: 0, w: 0, h: 5 },
      { kind: "rect", mode: "reveal", x: 0, y: 0, w: -3, h: 5 },
      { kind: "rect", mode: "x", x: 0, y: 0, w: 3, h: 5 },
      { kind: "rect", mode: "reveal", x: "0", y: 0, w: 3, h: 5 },
      { kind: "rect", mode: "reveal", x: 1e9, y: 0, w: 3, h: 5 },
      { kind: "brush", mode: "reveal", size: 1, points: [1, 2] },
      { kind: "brush", mode: "reveal", size: 20, points: [1] },
      { kind: "brush", mode: "reveal", size: 20, points: [] },
      { kind: "brush", mode: "reveal", size: 20, points: [1, 2, "a", 4] },
      { kind: "brush", mode: "reveal", size: 20, points: new Array(3002).fill(1) },
      { kind: "circulo", mode: "reveal" },
    ]) {
      expect((await fogApi("POST", "/shapes", body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await fogApi("PATCH", "", { enabled: "sim" })).status).toBe(400);
    const missing = await api(server, "PATCH", "/api/scenes/999/fog", {
      cookie: gm,
      body: { enabled: true },
    });
    expect(missing.status).toBe(404);
  });

  it("limita o número de formas", async () => {
    // Insere direto no banco seria mais rápido; pela API são 2000 chamadas pequenas.
    const shape = rect(0, 0, 1, 1);
    let last = 201;
    for (let i = 0; i < 2001 && last === 201; i++) {
      last = (await fogApi("POST", "/shapes", shape)).status;
    }
    expect(last).toBe(409);
  }, 60_000);

  it("apagar a cena apaga a fog dela", async () => {
    await fogApi("POST", "/shapes", rect(0, 0, 10, 10));
    await api(server, "POST", "/api/scenes", { cookie: gm, body: { name: "B" } });
    await api(server, "DELETE", `/api/scenes/${scene.id}`, { cookie: gm });
    expect((await fogApi("GET", "")).status).toBe(404);
  });
});

describe("o que cada um recebe", () => {
  it("jogador recebe a fog só da cena ativa; mestre recebe todas", async () => {
    const second = (
      await api<SceneSummary[]>(server, "POST", "/api/scenes", { cookie: gm, body: { name: "B" } })
    ).body[1]!;
    await fogApi("PATCH", "", { enabled: true });
    await api(server, "PATCH", `/api/scenes/${second.id}/fog`, {
      cookie: gm,
      body: { enabled: true },
    });
    const player = await open(rita);
    const master = await open(gm);
    expect(player.snapshot.fogs.map((f) => f.sceneId)).toEqual([scene.id]);
    expect(master.snapshot.fogs.map((f) => f.sceneId)).toEqual([scene.id, second.id]);
  });

  it("mudanças na fog chegam ao vivo ao mestre e, se a cena é a ativa, ao jogador", async () => {
    const second = (
      await api<SceneSummary[]>(server, "POST", "/api/scenes", { cookie: gm, body: { name: "B" } })
    ).body[1]!;
    const player = await open(rita);
    const master = await open(gm);
    const playerAdds = record(player.client, "fog:add");
    const playerSets = record(player.client, "fog:set");
    const masterAdds = record(master.client, "fog:add");

    await fogApi("POST", "/shapes", rect(1, 1, 5, 5));
    await api(server, "POST", `/api/scenes/${second.id}/fog/shapes`, {
      cookie: gm,
      body: rect(2, 2, 5, 5),
    });
    await fogApi("POST", "/cover-all");
    await settle();
    expect(playerAdds.map(([id]) => id)).toEqual([scene.id]);
    expect(masterAdds.map(([id]) => id)).toEqual([scene.id, second.id]);
    expect(playerSets.map(([f]) => f.sceneId)).toEqual([scene.id]);
  });

  it("ao ativar outra cena o jogador recebe a fog dela", async () => {
    const second = (
      await api<SceneSummary[]>(server, "POST", "/api/scenes", { cookie: gm, body: { name: "B" } })
    ).body[1]!;
    await api(server, "PATCH", `/api/scenes/${second.id}/fog`, {
      cookie: gm,
      body: { enabled: true },
    });
    const player = await open(rita);
    const sets = record(player.client, "fog:set");
    await api(server, "POST", `/api/scenes/${second.id}/activate`, { cookie: gm });
    await settle();
    expect(sets.at(-1)![0]).toMatchObject({ sceneId: second.id, enabled: true });
  });
});

describe("tokens sob fog", () => {
  it("o jogador nunca recebe token sob fog, e o mestre recebe todos", async () => {
    await makeToken("Escondido", 100, 100);
    await makeToken("Visível", 600, 600);
    await fogApi("PATCH", "", { enabled: true });
    await fogApi("POST", "/shapes", rect(500, 500, 200, 200));
    const player = await open(rita);
    const master = await open(gm);
    expect(player.snapshot.tokens.map((t) => t.name)).toEqual(["Visível"]);
    expect(master.snapshot.tokens.map((t) => t.name)).toEqual(["Escondido", "Visível"]);
  });

  it("com a fog desligada o token aparece; ligar faz sumir; revelar faz voltar", async () => {
    const token = (await makeToken("Kira", 100, 100)).body;
    const player = await open(rita);
    expect(player.snapshot.tokens).toHaveLength(1);
    const upserts = record(player.client, "token:upsert");
    const removes = record(player.client, "token:remove");

    await fogApi("PATCH", "", { enabled: true });
    await settle();
    expect(removes.map(([id]) => id)).toEqual([token.id]);

    await fogApi("POST", "/shapes", rect(0, 0, 300, 300));
    await settle();
    expect(upserts.map(([t]) => t.id)).toEqual([token.id]);

    await fogApi("POST", "/shapes", rect(0, 0, 300, 300, "cover"));
    await settle();
    expect(removes).toHaveLength(2);
    await fogApi("DELETE", "/shapes/last");
    await settle();
    expect(upserts).toHaveLength(2);
    // Nada de mensagem repetida se a fog muda mas o token continua como estava.
    await fogApi("POST", "/shapes", rect(900, 700, 50, 50));
    await settle();
    expect(upserts).toHaveLength(2);
    expect(removes).toHaveLength(2);
  });

  it("o mestre arrasta um token para dentro da fog: o jogador o perde antes de ver a posição", async () => {
    const token = (await makeToken("Guarda", 100, 100)).body;
    await fogApi("PATCH", "", { enabled: true });
    await fogApi("POST", "/shapes", rect(0, 0, 400, 400));
    const player = await open(rita);
    const master = await open(gm);
    expect(player.snapshot.tokens).toHaveLength(1);
    const moves = record(player.client, "token:move");
    const removes = record(player.client, "token:remove");
    const upserts = record(player.client, "token:upsert");

    master.client.emit("token:move", { id: token.id, x: 300, y: 300, final: false });
    await settle(60);
    master.client.emit("token:move", { id: token.id, x: 800, y: 700, final: true });
    await settle();
    expect(moves.map(([, x]) => x)).toEqual([300]);
    expect(removes.map(([id]) => id)).toEqual([token.id]);
    // Qualquer mensagem posterior sobre ele, enquanto sob fog, também não chega.
    master.client.emit("token:move", { id: token.id, x: 850, y: 700, final: true });
    await settle();
    expect(moves).toHaveLength(1);
    expect(upserts).toHaveLength(0);
    // E ao sair da fog ele volta, já com a posição nova.
    master.client.emit("token:move", { id: token.id, x: 200, y: 200, final: true });
    await settle();
    expect(upserts.map(([t]) => [t.x, t.y])).toEqual([[200, 200]]);
  });

  it("o dono sempre vê e move o próprio token, mesmo sob fog; os outros jogadores não", async () => {
    const token = (await makeToken("Kira", 100, 100, { ownerId: ritaId })).body;
    await fogApi("PATCH", "", { enabled: true });
    const sam = (await api<LoginResponse>(server, "POST", "/api/login", { body: { name: "Sam" } }))
      .cookie!;
    const owner = await open(rita);
    const other = await open(sam);
    expect(owner.snapshot.tokens.map((t) => t.id)).toEqual([token.id]);
    expect(other.snapshot.tokens).toEqual([]);
    const otherMoves = record(other.client, "token:move");
    const otherUpserts = record(other.client, "token:upsert");

    owner.client.emit("token:move", { id: token.id, x: 150, y: 150, final: true });
    await settle();
    expect(otherMoves).toHaveLength(0);
    expect(otherUpserts).toHaveLength(0);
    expect((await open(gm)).snapshot.tokens[0]).toMatchObject({ x: 150, y: 150 });

    // Quando o mestre revela a região, os outros passam a ver.
    await fogApi("POST", "/reveal-all");
    await settle();
    expect(otherUpserts.map(([t]) => t.id)).toEqual([token.id]);
  });
});
