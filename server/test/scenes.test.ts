import fs from "node:fs";
import path from "node:path";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  ApiError,
  ClientToServerEvents,
  ImageInfo,
  RulerState,
  SceneSummary,
  SceneView,
  ServerToClientEvents,
  StateSnapshot,
} from "@vtt/shared";
import { api, pngHeader, startServer, TINY_PNG, uploadForm, type TestServer } from "./helpers.js";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let server: TestServer;
let gm: string;
let rita: string;
const clients: Client[] = [];

beforeEach(async () => {
  server = await startServer();
  gm = (
    await api(server, "POST", "/api/login", {
      body: { name: "Mestre", gm: true, password: "senha-do-mestre" },
    })
  ).cookie!;
  rita = (await api(server, "POST", "/api/login", { body: { name: "Rita" } })).cookie!;
});
afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect();
  await server.stop();
});

const upload = (
  content: Buffer | string = TINY_PNG,
  options: { cookie?: string; name?: string; type?: string } = {},
) =>
  api<ImageInfo & ApiError>(server, "POST", "/api/images", {
    cookie: options.cookie ?? gm,
    form: uploadForm(content, options.name, options.type),
  });
const createScene = (body: object, cookie = gm) =>
  api<SceneSummary[] & ApiError>(server, "POST", "/api/scenes", { cookie, body });

function open(cookie: string): { client: Client; snapshot: Promise<StateSnapshot> } {
  const client: Client = connect(server.url, {
    transports: ["websocket"],
    extraHeaders: { cookie },
    reconnection: false,
  });
  clients.push(client);
  return { client, snapshot: new Promise((resolve) => client.once("state:snapshot", resolve)) };
}

describe("upload de imagens", () => {
  it("o mestre envia um PNG e recebe o tamanho e o endereço", async () => {
    const res = await upload();
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ width: 1, height: 1 });
    expect(res.body.url).toMatch(/^\/uploads\/[0-9a-f-]+\.png$/);
  });

  it("jogador não envia imagem", async () => {
    expect((await upload(TINY_PNG, { cookie: rita })).status).toBe(403);
  });

  it("confere o conteúdo, não o nome nem o tipo informado", async () => {
    const fake = await upload(
      "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>",
      {
        name: "mapa.png",
      },
    );
    expect(fake.status).toBe(415);
    const html = await upload("<html></html>");
    expect(html.status).toBe(415);
    // PNG de verdade com nome e tipo errados é aceito, e o arquivo ganha a extensão certa
    const real = await upload(TINY_PNG, { name: "foto.txt", type: "text/plain" });
    expect(real.status).toBe(201);
    expect(real.body.url.endsWith(".png")).toBe(true);
  });

  it("recusa imagem acima do limite de lado e acima do limite de MB", async () => {
    const wide = await upload(pngHeader(9000, 100));
    expect(wide.status).toBe(415);
    expect(wide.body.error).toContain("8192");

    await server.stop();
    server = await startServer({ maxUploadMb: 0.0005 });
    gm = (
      await api(server, "POST", "/api/login", {
        body: { name: "Mestre", gm: true, password: "senha-do-mestre" },
      })
    ).cookie!;
    const big = await upload(Buffer.concat([TINY_PNG, Buffer.alloc(2048)]));
    expect(big.status).toBe(413);
  });

  it("pede um arquivo quando o envio vem vazio", async () => {
    const res = await api<ApiError>(server, "POST", "/api/images", {
      cookie: gm,
      form: new FormData(),
    });
    expect(res.status).toBe(400);
  });

  it("serve o arquivo só para quem está logado, com tipo certo e sem adivinhação de tipo", async () => {
    const { body } = await upload();
    const anonymous = await fetch(`${server.url}${body.url}`);
    expect(anonymous.status).toBe(401);

    const ok = await fetch(`${server.url}${body.url}`, { headers: { cookie: rita } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    expect(ok.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await ok.arrayBuffer()).equals(TINY_PNG)).toBe(true);

    const missing = await fetch(`${server.url}/uploads/nao-existe.png`, {
      headers: { cookie: rita },
    });
    expect(missing.status).toBe(404);
    const traversal = await fetch(`${server.url}/uploads/..%2f..%2fvtt.db`, {
      headers: { cookie: rita },
    });
    expect(traversal.status).not.toBe(200);
  });

  it("apaga uploads abandonados e mantém os que uma cena usa", async () => {
    const used = await upload();
    const orphan = await upload();
    await createScene({ name: "Bar", imageId: used.body.id });
    const dir = path.join(server.dataDir, "uploads");
    expect(fs.readdirSync(dir)).toHaveLength(2);

    const db = (await import("better-sqlite3")).default(
      path.join(server.dataDir, "data", "vtt.db"),
    );
    db.prepare("UPDATE images SET created_at = datetime('now', '-2 days')").run();
    db.close();
    const { Images } = await import("../src/images.js");
    const dbForSweep = (await import("better-sqlite3")).default(
      path.join(server.dataDir, "data", "vtt.db"),
    );
    expect(new Images(dbForSweep, dir).sweepOrphans(24 * 3600 * 1000)).toBe(1);
    dbForSweep.close();
    expect(fs.readdirSync(dir)).toHaveLength(1);
    expect(fs.readdirSync(dir)[0]).toBe(path.basename(used.body.url));
    expect(orphan.status).toBe(201);
  });
});

describe("cenas", () => {
  it("só o mestre vê e mexe nas cenas", async () => {
    expect((await api(server, "GET", "/api/scenes", { cookie: rita })).status).toBe(403);
    expect((await createScene({ name: "Bar" }, rita)).status).toBe(403);
    expect((await api(server, "GET", "/api/scenes")).status).toBe(401);
  });

  it("cria com os padrões e a primeira cena já nasce ativa", async () => {
    const image = await upload();
    const first = await createScene({ name: "  Bar do Afterlife ", imageId: image.body.id });
    expect(first.status).toBe(201);
    expect(first.body[0]).toMatchObject({
      name: "Bar do Afterlife",
      gridPx: 70,
      metersPerSquare: 2,
      gridVisible: true,
      isActive: true,
      imageUrl: image.body.url,
      imageWidth: 1,
    });
    const second = await createScene({ name: "Telhado" });
    expect(second.body.map((s) => [s.name, s.isActive])).toEqual([
      ["Bar do Afterlife", true],
      ["Telhado", false],
    ]);
  });

  it("valida nome, grid, metros e imagem", async () => {
    expect((await createScene({})).status).toBe(400);
    expect((await createScene({ name: "x".repeat(61) })).status).toBe(400);
    expect((await createScene({ name: "A", gridPx: 5 })).status).toBe(400);
    expect((await createScene({ name: "A", gridPx: 70.5 })).status).toBe(400);
    expect((await createScene({ name: "A", gridPx: 501 })).status).toBe(400);
    expect((await createScene({ name: "A", metersPerSquare: 0 })).status).toBe(400);
    expect((await createScene({ name: "A", metersPerSquare: "2" })).status).toBe(400);
    expect((await createScene({ name: "A", imageId: 999 })).status).toBe(400);
    expect((await createScene({ name: "A", gridVisible: "sim" })).status).toBe(400);
  });

  it("edita campos soltos sem mexer nos outros", async () => {
    const created = await createScene({ name: "Bar", gridPx: 100 });
    const id = created.body[0]!.id;
    const patched = await api<SceneSummary[]>(server, "PATCH", `/api/scenes/${id}`, {
      cookie: gm,
      body: { metersPerSquare: 1.5, gridVisible: false },
    });
    expect(patched.body[0]).toMatchObject({
      name: "Bar",
      gridPx: 100,
      metersPerSquare: 1.5,
      gridVisible: false,
    });
    expect(
      (await api(server, "PATCH", "/api/scenes/999", { cookie: gm, body: { name: "X" } })).status,
    ).toBe(404);
  });

  it("ativar uma cena desativa a outra", async () => {
    await createScene({ name: "A" });
    const list = await createScene({ name: "B" });
    const b = list.body[1]!.id;
    const res = await api<SceneSummary[]>(server, "POST", `/api/scenes/${b}/activate`, {
      cookie: gm,
    });
    expect(res.body.map((s) => s.isActive)).toEqual([false, true]);
    expect((await api(server, "POST", "/api/scenes/999/activate", { cookie: gm })).status).toBe(
      404,
    );
  });

  it("trocar a imagem apaga a antiga, e excluir a cena apaga a imagem", async () => {
    const dir = path.join(server.dataDir, "uploads");
    const one = await upload();
    const created = await createScene({ name: "Bar", imageId: one.body.id });
    const id = created.body[0]!.id;
    const two = await upload();
    await api(server, "PATCH", `/api/scenes/${id}`, { cookie: gm, body: { imageId: two.body.id } });
    expect(fs.readdirSync(dir)).toEqual([path.basename(two.body.url)]);

    const gone = await api<SceneSummary[]>(server, "DELETE", `/api/scenes/${id}`, { cookie: gm });
    expect(gone.body).toEqual([]);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("a mesma imagem em duas cenas só some quando as duas saem", async () => {
    const dir = path.join(server.dataDir, "uploads");
    const image = await upload();
    await createScene({ name: "A", imageId: image.body.id });
    const list = await createScene({ name: "B", imageId: image.body.id });
    await api(server, "DELETE", `/api/scenes/${list.body[0]!.id}`, { cookie: gm });
    expect(fs.readdirSync(dir)).toHaveLength(1);
    await api(server, "DELETE", `/api/scenes/${list.body[1]!.id}`, { cookie: gm });
    expect(fs.readdirSync(dir)).toHaveLength(0);
  });
});

describe("tempo real do mapa", () => {
  it("quem conecta recebe a cena ativa, e quem entra sem cena recebe null", async () => {
    const empty = open(rita);
    expect((await empty.snapshot).scene).toBeNull();

    const created = await createScene({ name: "Bar" });
    const late = open(rita);
    const snapshot = await late.snapshot;
    expect(snapshot.scene).toMatchObject({ id: created.body[0]!.id, name: "Bar" });
    expect(snapshot.scene).not.toHaveProperty("isActive");
    expect(snapshot.rulers).toEqual([]);
  });

  it("avisa todos quando a cena ativa muda, é editada ou apagada", async () => {
    await createScene({ name: "A" });
    const list = await createScene({ name: "B" });
    const player = open(rita);
    await player.snapshot;

    const next = (): Promise<SceneView | null> =>
      new Promise((resolve) => player.client.once("scene:update", resolve));

    let update = next();
    await api(server, "POST", `/api/scenes/${list.body[1]!.id}/activate`, { cookie: gm });
    expect((await update)?.name).toBe("B");

    update = next();
    await api(server, "PATCH", `/api/scenes/${list.body[1]!.id}`, {
      cookie: gm,
      body: { gridPx: 100 },
    });
    expect((await update)?.gridPx).toBe(100);

    update = next();
    await api(server, "DELETE", `/api/scenes/${list.body[1]!.id}`, { cookie: gm });
    expect(await update).toBeNull();
  });
});

describe("régua", () => {
  const line = { x1: 0, y1: 0, x2: 140, y2: 0 };

  const nextRuler = (client: Client): Promise<RulerState | null> =>
    new Promise((resolve) => client.once("ruler:update", (_id, ruler) => resolve(ruler)));

  it("aparece para os outros, não para quem arrasta, e some ao soltar ou desconectar", async () => {
    const a = open(gm);
    const b = open(rita);
    await Promise.all([a.snapshot, b.snapshot]);
    const echoes: unknown[] = [];
    b.client.on("ruler:update", (_id, ruler) => echoes.push(ruler));

    let seen = nextRuler(a.client);
    b.client.emit("ruler:update", line);
    expect(await seen).toMatchObject({ ...line, name: "Rita" });

    seen = nextRuler(a.client);
    b.client.emit("ruler:update", null);
    expect(await seen).toBeNull();

    b.client.emit("ruler:update", line);
    await nextRuler(a.client);
    seen = nextRuler(a.client);
    b.client.disconnect();
    expect(await seen).toBeNull();
    expect(echoes).toEqual([]);
  });

  it("quem conecta no meio vê a régua em andamento, e coordenadas ruins são ignoradas", async () => {
    const a = open(rita);
    await a.snapshot;
    a.client.emit("ruler:update", { x1: Number.NaN, y1: 0, x2: 1, y2: 1 });
    a.client.emit("ruler:update", { x1: 0, y1: 0, x2: 1e9, y2: 1 });
    a.client.emit("ruler:update", "lixo" as never);
    a.client.emit("ruler:update", line);
    await expect
      .poll(async () => (await api<unknown>(server, "GET", "/api/health")).status)
      .toBe(200);

    const late = open(gm);
    const snapshot = await late.snapshot;
    expect(snapshot.rulers).toHaveLength(1);
    expect(snapshot.rulers[0]).toMatchObject({ ...line, name: "Rita" });
  });

  it("as réguas somem quando o mestre troca de cena", async () => {
    await createScene({ name: "A" });
    const list = await createScene({ name: "B" });
    const a = open(rita);
    await a.snapshot;
    a.client.emit("ruler:update", line);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await api(server, "POST", `/api/scenes/${list.body[1]!.id}/activate`, { cookie: gm });
    const late = open(gm);
    expect((await late.snapshot).rulers).toEqual([]);
  });
});
