import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  initials,
  snapToGrid,
  type ApiError,
  type ClientToServerEvents,
  type ImageInfo,
  type LoginResponse,
  type SceneSummary,
  type ServerToClientEvents,
  type StateSnapshot,
  type TokenView,
} from "@vtt/shared";
import { Images } from "../src/images.js";
import { api, pngHeader, startServer, TINY_PNG, uploadForm, type TestServer } from "./helpers.js";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let server: TestServer;
let gm: string;
let rita: string;
let ritaId: number;
let sam: string;
let samId: number;
let scene: SceneSummary;
const clients: Client[] = [];

const login = async (name: string) => {
  const res = await api<LoginResponse>(server, "POST", "/api/login", { body: { name } });
  return { cookie: res.cookie!, id: res.body.user.id };
};

beforeEach(async () => {
  server = await startServer();
  gm = (
    await api(server, "POST", "/api/login", {
      body: { name: "Mestre", gm: true, password: "senha-do-mestre" },
    })
  ).cookie!;
  ({ cookie: rita, id: ritaId } = await login("Rita"));
  ({ cookie: sam, id: samId } = await login("Sam"));
  const image = await api<ImageInfo>(server, "POST", "/api/images", {
    cookie: gm,
    form: uploadForm(pngHeader(1000, 800)),
  });
  const scenes = await api<SceneSummary[]>(server, "POST", "/api/scenes", {
    cookie: gm,
    body: { name: "Telhado", imageId: image.body.id },
  });
  scene = scenes.body[0]!;
});
afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect();
  await server.stop();
});

const createToken = (body: object, cookie = gm) =>
  api<TokenView & ApiError>(server, "POST", "/api/tokens", {
    cookie,
    body: { sceneId: scene.id, name: "Kira", x: 100, y: 100, ...body },
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

/** Registra tudo que um evento recebe, para conferir também o que NÃO chegou. */
function record<E extends keyof ServerToClientEvents>(client: Client, event: E) {
  const received: Parameters<ServerToClientEvents[E]>[] = [];
  client.on(event, ((...args: Parameters<ServerToClientEvents[E]>) => {
    received.push(args);
  }) as never);
  return received;
}

const settle = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));

describe("criar e editar tokens", () => {
  it("o mestre cria um token com os padrões e jogador não cria", async () => {
    const res = await createToken({});
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: "Kira",
      x: 100,
      y: 100,
      size: 1,
      color: "#f5e90a",
      imageUrl: null,
      ownerId: null,
      hidden: false,
      hostile: false,
    });
    expect((await createToken({}, rita)).status).toBe(403);
    const patch = await api(server, "PATCH", `/api/tokens/${res.body.id}`, {
      cookie: rita,
      body: { name: "Meu" },
    });
    expect(patch.status).toBe(403);
    const del = await api(server, "DELETE", `/api/tokens/${res.body.id}`, { cookie: rita });
    expect(del.status).toBe(403);
  });

  it("recusa dados inválidos", async () => {
    for (const body of [
      { name: "" },
      { name: "x".repeat(41) },
      { size: 0.3 },
      { size: 11 },
      { size: 1.25 },
      { color: "vermelho" },
      { x: "10" },
      { x: 1e9 },
      { hidden: "sim" },
      { hostile: "sim" },
      { ownerId: 999 },
      { imageId: 999 },
      { sceneId: 999 },
    ]) {
      const res = await createToken(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect((await createToken({ sceneId: undefined })).status).toBe(400);
  });

  it("marca e desmarca o token como hostil", async () => {
    const created = await createToken({ hostile: true });
    expect(created.status).toBe(201);
    expect(created.body.hostile).toBe(true);
    const patched = await api<TokenView>(server, "PATCH", `/api/tokens/${created.body.id}`, {
      cookie: gm,
      body: { hostile: false },
    });
    expect(patched.body.hostile).toBe(false);
  });

  it("mantém o centro dentro do mapa", async () => {
    const res = await createToken({ x: 5000, y: -20 });
    expect(res.body).toMatchObject({ x: 1000, y: 0 });
  });

  it("edita só o que foi enviado e apaga", async () => {
    const created = await createToken({ ownerId: ritaId, size: 2 });
    const patched = await api<TokenView>(server, "PATCH", `/api/tokens/${created.body.id}`, {
      cookie: gm,
      body: { name: "Kira Nova", color: "#FF00AA" },
    });
    expect(patched.body).toMatchObject({
      name: "Kira Nova",
      color: "#ff00aa",
      size: 2,
      ownerId: ritaId,
    });
    const missing = await api(server, "PATCH", "/api/tokens/999", { cookie: gm, body: {} });
    expect(missing.status).toBe(404);
    expect(
      (await api(server, "DELETE", `/api/tokens/${created.body.id}`, { cookie: gm })).status,
    ).toBe(204);
    expect(
      (await api(server, "DELETE", `/api/tokens/${created.body.id}`, { cookie: gm })).status,
    ).toBe(404);
  });
});

describe("quem vê o quê", () => {
  it("jogador recebe tokens visíveis ao conectar, e nunca os ocultos", async () => {
    await createToken({ name: "Visível" });
    await createToken({ name: "Oculto", hidden: true });
    const player = await open(rita);
    expect(player.snapshot.tokens.map((t) => t.name)).toEqual(["Visível"]);
    const master = await open(gm);
    expect(master.snapshot.tokens.map((t) => t.name)).toEqual(["Visível", "Oculto"]);
  });

  it("token novo chega ao vivo; oculto só ao mestre", async () => {
    const player = await open(rita);
    const master = await open(gm);
    const playerGets = record(player.client, "token:upsert");
    const masterGets = record(master.client, "token:upsert");
    await createToken({ name: "Aberto" });
    await createToken({ name: "Segredo", hidden: true });
    await settle();
    expect(playerGets.map(([t]) => t.name)).toEqual(["Aberto"]);
    expect(masterGets.map(([t]) => t.name)).toEqual(["Aberto", "Segredo"]);
  });

  it("revelar faz o token aparecer e esconder faz sumir para o jogador", async () => {
    const created = await createToken({ hidden: true });
    const player = await open(rita);
    expect(player.snapshot.tokens).toEqual([]);
    const upserts = record(player.client, "token:upsert");
    const removes = record(player.client, "token:remove");

    await api(server, "PATCH", `/api/tokens/${created.body.id}`, {
      cookie: gm,
      body: { hidden: false },
    });
    await settle();
    expect(upserts.map(([t]) => t.id)).toEqual([created.body.id]);

    await api(server, "PATCH", `/api/tokens/${created.body.id}`, {
      cookie: gm,
      body: { hidden: true },
    });
    await settle();
    expect(removes.map(([id]) => id)).toEqual([created.body.id]);
    expect(upserts).toHaveLength(1);
  });

  it("apagar chega a todos", async () => {
    const created = await createToken({});
    const player = await open(rita);
    const removes = record(player.client, "token:remove");
    await api(server, "DELETE", `/api/tokens/${created.body.id}`, { cookie: gm });
    await settle();
    expect(removes.map(([id]) => id)).toEqual([created.body.id]);
  });

  it("tokens de outra cena só chegam ao jogador quando a cena é ativada", async () => {
    const second = (
      await api<SceneSummary[]>(server, "POST", "/api/scenes", {
        cookie: gm,
        body: { name: "Beco" },
      })
    ).body[1]!;
    await createToken({ name: "Do telhado" });
    await createToken({ name: "Do beco", sceneId: second.id });

    const player = await open(rita);
    const master = await open(gm);
    expect(player.snapshot.tokens.map((t) => t.name)).toEqual(["Do telhado"]);
    expect(master.snapshot.tokens.map((t) => t.name)).toEqual(["Do telhado", "Do beco"]);

    const set = record(player.client, "tokens:set");
    await api(server, "POST", `/api/scenes/${second.id}/activate`, { cookie: gm });
    await settle();
    expect(set.at(-1)![0].map((t) => t.name)).toEqual(["Do beco"]);
  });
});

describe("mover tokens", () => {
  it("o dono move o token: os outros veem na hora e a posição final fica gravada", async () => {
    const token = (await createToken({ ownerId: ritaId })).body;
    const owner = await open(rita);
    const other = await open(sam);
    const master = await open(gm);
    const otherSees = record(other.client, "token:move");
    const masterSees = record(master.client, "token:move");
    const ownerSees = record(owner.client, "token:move");

    owner.client.emit("token:move", { id: token.id, x: 210, y: 140, final: false });
    await settle(60);
    // O arrasto ainda não foi gravado.
    expect((await open(sam)).snapshot.tokens[0]).toMatchObject({ x: 100, y: 100 });

    owner.client.emit("token:move", { id: token.id, x: 350, y: 280, final: true });
    await settle();
    expect(otherSees).toEqual([
      [token.id, 210, 140],
      [token.id, 350, 280],
    ]);
    expect(masterSees).toHaveLength(2);
    expect(ownerSees).toHaveLength(0);
    expect((await open(sam)).snapshot.tokens[0]).toMatchObject({ x: 350, y: 280 });
  });

  it("jogador não move token alheio nem sem dono, e é corrigido", async () => {
    const mine = (await createToken({ ownerId: ritaId })).body;
    const notMine = (await createToken({ ownerId: samId })).body;
    const nobody = (await createToken({})).body;
    const player = await open(rita);
    const other = await open(sam);
    const corrections = record(player.client, "token:upsert");
    const spied = record(other.client, "token:move");

    for (const t of [notMine, nobody]) {
      player.client.emit("token:move", { id: t.id, x: 900, y: 700, final: true });
    }
    await settle();
    expect(spied).toHaveLength(0);
    expect(corrections.map(([t]) => [t.id, t.x, t.y])).toEqual([
      [notMine.id, 100, 100],
      [nobody.id, 100, 100],
    ]);
    const now = (await open(gm)).snapshot.tokens;
    expect(now.every((t) => t.x === 100 && t.y === 100)).toBe(true);
    expect(mine.ownerId).toBe(ritaId);
  });

  it("jogador não move um token que o mestre escondeu", async () => {
    const token = (await createToken({ ownerId: ritaId, hidden: true })).body;
    const player = await open(rita);
    const removes = record(player.client, "token:remove");
    player.client.emit("token:move", { id: token.id, x: 500, y: 500, final: true });
    await settle();
    expect(removes.map(([id]) => id)).toEqual([token.id]);
    expect((await open(gm)).snapshot.tokens[0]).toMatchObject({ x: 100, y: 100 });
  });

  it("jogador não move token de cena inativa, e o mestre move qualquer um", async () => {
    const second = (
      await api<SceneSummary[]>(server, "POST", "/api/scenes", {
        cookie: gm,
        body: { name: "Beco" },
      })
    ).body[1]!;
    const token = (await createToken({ ownerId: ritaId, sceneId: second.id })).body;
    const player = await open(rita);
    const master = await open(gm);
    const playerMoves = record(player.client, "token:move");
    const masterOtherMoves = record(master.client, "token:move");
    const masterTwo = await open(gm);
    const masterTwoMoves = record(masterTwo.client, "token:move");

    player.client.emit("token:move", { id: token.id, x: 400, y: 400, final: true });
    await settle();
    expect((await open(gm)).snapshot.tokens[0]).toMatchObject({ x: 100, y: 100 });

    master.client.emit("token:move", { id: token.id, x: 400, y: 400, final: true });
    await settle();
    expect((await open(gm)).snapshot.tokens[0]).toMatchObject({ x: 400, y: 400 });
    // O token está numa cena que o jogador não vê: ele não recebe nada.
    expect(playerMoves).toHaveLength(0);
    expect(masterTwoMoves).toHaveLength(1);
    expect(masterOtherMoves).toHaveLength(0);
  });

  it("movimento do mestre num token oculto não chega aos jogadores", async () => {
    const token = (await createToken({ hidden: true })).body;
    const player = await open(rita);
    const master = await open(gm);
    const spied = record(player.client, "token:move");
    master.client.emit("token:move", { id: token.id, x: 300, y: 300, final: true });
    await settle();
    expect(spied).toHaveLength(0);
  });

  it("limita ao mapa e avisa o autor do ajuste", async () => {
    const token = (await createToken({ ownerId: ritaId })).body;
    const player = await open(rita);
    const moves = record(player.client, "token:move");
    player.client.emit("token:move", { id: token.id, x: 99999, y: -5, final: true });
    await settle();
    expect(moves).toEqual([[token.id, 1000, 0]]);
    expect((await open(gm)).snapshot.tokens[0]).toMatchObject({ x: 1000, y: 0 });
  });

  it("ignora mensagens malformadas", async () => {
    const token = (await createToken({ ownerId: ritaId })).body;
    const player = await open(rita);
    const emit = player.client.emit.bind(player.client) as (
      event: string,
      ...args: unknown[]
    ) => void;
    emit("token:move", null);
    emit("token:move", { id: token.id, x: "a", y: 1, final: true });
    emit("token:move", { id: token.id, x: NaN, y: 1, final: true });
    emit("token:move", { id: token.id, x: 1, y: 1 });
    emit("token:move", { id: 12345, x: 1, y: 1, final: true });
    await settle();
    expect((await open(gm)).snapshot.tokens[0]).toMatchObject({ x: 100, y: 100 });
  });

  it("segura o arrasto rápido demais, mas nunca a posição final", async () => {
    const token = (await createToken({ ownerId: ritaId })).body;
    const player = await open(rita);
    const other = await open(sam);
    const seen = record(other.client, "token:move");
    for (let i = 1; i <= 20; i++) {
      player.client.emit("token:move", { id: token.id, x: 100 + i, y: 100, final: false });
    }
    player.client.emit("token:move", { id: token.id, x: 500, y: 500, final: true });
    await settle();
    expect(seen.length).toBeLessThan(21);
    expect(seen.at(-1)).toEqual([token.id, 500, 500]);
  });
});

describe("imagens e limpeza", () => {
  const files = () => fs.readdirSync(path.join(server.dataDir, "uploads"));
  const uploadImage = () =>
    api<ImageInfo>(server, "POST", "/api/images", {
      cookie: gm,
      form: uploadForm(TINY_PNG),
    });

  it("token com imagem mostra o endereço dela e a apaga junto com o token", async () => {
    const before = files().length;
    const image = (await uploadImage()).body;
    const token = (await createToken({ imageId: image.id })).body;
    expect(token.imageUrl).toBe(image.url);
    expect(files()).toHaveLength(before + 1);
    await api(server, "DELETE", `/api/tokens/${token.id}`, { cookie: gm });
    expect(files()).toHaveLength(before);
  });

  it("trocar a imagem apaga a antiga; a que ainda está em uso fica", async () => {
    const before = files().length;
    const first = (await uploadImage()).body;
    const second = (await uploadImage()).body;
    const a = (await createToken({ imageId: first.id })).body;
    const b = (await createToken({ imageId: first.id })).body;
    await api(server, "PATCH", `/api/tokens/${a.id}`, { cookie: gm, body: { imageId: second.id } });
    expect(files()).toHaveLength(before + 2);
    await api(server, "PATCH", `/api/tokens/${b.id}`, { cookie: gm, body: { imageId: null } });
    expect(files()).toHaveLength(before + 1);
    expect(files().some((f) => first.url.endsWith(f))).toBe(false);
  });

  it("apagar a cena apaga os tokens dela e as imagens deles", async () => {
    const image = (await uploadImage()).body;
    await createToken({ imageId: image.id });
    const other = (
      await api<SceneSummary[]>(server, "POST", "/api/scenes", { cookie: gm, body: { name: "B" } })
    ).body[1]!;
    await createToken({ sceneId: other.id, name: "Fica" });
    await api(server, "DELETE", `/api/scenes/${scene.id}`, { cookie: gm });
    const tokens = (await open(gm)).snapshot.tokens;
    expect(tokens.map((t) => t.name)).toEqual(["Fica"]);
    // Sobra nada: nem a imagem do mapa da cena nem a do token.
    expect(files()).toHaveLength(0);
  });

  it("a varredura de uploads abandonados poupa a imagem que um token usa", async () => {
    const used = (await uploadImage()).body;
    const abandoned = (await uploadImage()).body;
    await createToken({ imageId: used.id });
    const before = files().length;
    const db = new Database(path.join(server.dataDir, "data", "vtt.db"));
    try {
      const images = new Images(db, path.join(server.dataDir, "uploads"));
      expect(images.sweepOrphans(-60_000)).toBe(1);
    } finally {
      db.close();
    }
    expect(files()).toHaveLength(before - 1);
    expect(files().some((f) => used.url.endsWith(f))).toBe(true);
    expect(files().some((f) => abandoned.url.endsWith(f))).toBe(false);
  });

  it("expulsar o dono deixa o token sem dono e avisa o mestre", async () => {
    const token = (await createToken({ ownerId: ritaId })).body;
    const master = await open(gm);
    const set = record(master.client, "tokens:set");
    await api(server, "DELETE", `/api/users/${ritaId}`, { cookie: gm });
    await settle();
    expect(set.at(-1)![0].find((t) => t.id === token.id)?.ownerId).toBeNull();
  });
});

describe("ajudantes compartilhados", () => {
  it("encaixa o centro no grid conforme o tamanho", () => {
    expect(snapToGrid({ x: 100, y: 60 }, 1, 70)).toEqual({ x: 105, y: 35 });
    expect(snapToGrid({ x: 100, y: 60 }, 2, 70)).toEqual({ x: 70, y: 70 });
    expect(snapToGrid({ x: 100, y: 60 }, 3, 70)).toEqual({ x: 105, y: 35 });
    expect(snapToGrid({ x: 10, y: 10 }, 0.5, 70)).toEqual({ x: 35, y: 35 });
  });

  it("tira as iniciais do nome", () => {
    expect(initials("Kira")).toBe("KI");
    expect(initials("Kira Vance")).toBe("KV");
    expect(initials("  ana maria souza ")).toBe("AS");
    expect(initials("")).toBe("?");
  });
});
