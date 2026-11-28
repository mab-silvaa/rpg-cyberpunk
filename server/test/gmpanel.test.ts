import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  INITIATIVE_MAX_ENTRIES,
  NOTE_BODY_MAX_LENGTH,
  type ApiError,
  type CharacterView,
  type ImageInfo,
  type ClientToServerEvents,
  type InitiativeView,
  type Note,
  type RollResult,
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

describe("notas do mestre", () => {
  const note = (method: string, route: string, body?: unknown, cookie = gm) =>
    api<Note & Note[] & ApiError>(server, method, `/api/notes${route}`, { cookie, body });

  it("jogador não vê nem mexe", async () => {
    const created = (await note("POST", "", { title: "Segredo", body: "# vilão" })).body;
    expect((await note("GET", "", undefined, rita)).status).toBe(403);
    expect((await note("POST", "", { title: "x" }, rita)).status).toBe(403);
    expect((await note("PATCH", `/${created.id}`, { body: "x" }, rita)).status).toBe(403);
    expect((await note("DELETE", `/${created.id}`, undefined, rita)).status).toBe(403);
    expect((await note("GET", "", undefined, "")).status).toBe(401);
  });

  it("cria, edita, lista e apaga; a mais recente vem primeiro", async () => {
    const a = (await note("POST", "", { title: "A" })).body;
    const b = (await note("POST", "", { title: "B", body: "texto" })).body;
    expect(b.body).toBe("texto");
    const edited = await note("PATCH", `/${a.id}`, { body: "# Cena 1\n- item" });
    expect(edited.body).toMatchObject({ title: "A", body: "# Cena 1\n- item" });
    expect((await note("GET", "")).body.map((n) => n.title).sort()).toEqual(["A", "B"]);
    expect((await note("DELETE", `/${a.id}`)).status).toBe(204);
    expect((await note("DELETE", `/${a.id}`)).status).toBe(404);
    expect((await note("PATCH", "/999", { body: "x" })).status).toBe(404);
  });

  it("valida título e tamanho", async () => {
    expect((await note("POST", "", {})).status).toBe(400);
    expect((await note("POST", "", { title: "  " })).status).toBe(400);
    expect((await note("POST", "", { title: "x".repeat(81) })).status).toBe(400);
    const created = (await note("POST", "", { title: "ok" })).body;
    const tooBig = await note("PATCH", `/${created.id}`, {
      body: "x".repeat(NOTE_BODY_MAX_LENGTH + 1),
    });
    expect(tooBig.status).toBe(400);
    expect((await note("PATCH", `/${created.id}`, { body: 5 })).status).toBe(400);
  });

  it("o conteúdo das notas nunca vai para o socket", async () => {
    await note("POST", "", { title: "Segredo", body: "o vilão é o prefeito" });
    const master = await open(gm);
    expect(JSON.stringify(master.snapshot)).not.toContain("prefeito");
    expect(JSON.stringify((await open(rita)).snapshot)).not.toContain("prefeito");
  });
});

const init = (method: string, route: string, body?: unknown, cookie = gm) =>
  api<InitiativeView & ApiError>(server, method, `/api/initiative${route}`, { cookie, body });
const add = (name: string, value: number | null = null, extra: object = {}) =>
  init("POST", "/entries", { name, value, ...extra });

describe("iniciativa", () => {
  it("só o mestre mexe", async () => {
    const e = (await add("Kira", 12)).body.entries[0]!;
    expect((await init("GET", "", undefined, rita)).status).toBe(403);
    expect(
      (await add("x", 1, {}).then(() => init("POST", "/entries", { name: "Hack" }, rita))).status,
    ).toBe(403);
    for (const [method, route] of [
      ["PATCH", `/entries/${e.id}`],
      ["DELETE", `/entries/${e.id}`],
      ["POST", "/start"],
      ["POST", "/next"],
      ["POST", "/end"],
      ["POST", "/clear"],
      ["POST", "/roll"],
      ["POST", "/from-tokens"],
    ] as const) {
      expect((await init(method, route, {}, rita)).status, `${method} ${route}`).toBe(403);
    }
  });

  it("pula na vez quem está com o token derrotado", async () => {
    const image = await api<ImageInfo>(server, "POST", "/api/images", {
      cookie: gm,
      form: uploadForm(pngHeader(1000, 800)),
    });
    const scenes = await api<SceneSummary[]>(server, "POST", "/api/scenes", {
      cookie: gm,
      body: { name: "Beco", imageId: image.body.id },
    });
    const token = await api<TokenView>(server, "POST", "/api/tokens", {
      cookie: gm,
      body: { sceneId: scenes.body[0]!.id, name: "Capanga" },
    });
    await add("Kira", 17);
    await add("Capanga", 12, { tokenId: token.body.id });
    await add("Dex", 9);
    await api(server, "PATCH", `/api/tokens/${token.body.id}`, {
      cookie: gm,
      body: { defeated: true },
    });
    const view = (await init("GET", "")).body;
    expect(view.entries.map((e) => [e.name, e.defeated])).toEqual([
      ["Kira", false],
      ["Capanga", true],
      ["Dex", false],
    ]);
    await init("POST", "/start");
    expect((await init("POST", "/next")).body.activeId).toBe(view.entries[2]!.id);
    const wrapped = (await init("POST", "/next")).body;
    expect(wrapped).toMatchObject({ round: 2, activeId: view.entries[0]!.id });
  });

  it("ordena do maior valor para o menor; sem valor vai para o fim; empate pela ordem de entrada", async () => {
    await add("Sem valor");
    await add("Dex", 14);
    await add("Kira", 17);
    await add("Guarda", 14);
    const view = (await init("GET", "")).body;
    expect(view.entries.map((e) => e.name)).toEqual(["Kira", "Dex", "Guarda", "Sem valor"]);
    expect(view.round).toBe(0);
    expect(view.activeId).toBeNull();
  });

  it("valida nome e valor e limita o tamanho da lista", async () => {
    expect((await add("")).status).toBe(400);
    expect((await add("x".repeat(41))).status).toBe(400);
    expect((await add("a", 5000)).status).toBe(400);
    expect((await init("POST", "/entries", { name: "a", value: "x" })).status).toBe(400);
    expect((await init("POST", "/entries", { name: "a", hidden: "s" })).status).toBe(400);
    for (let i = 0; i < INITIATIVE_MAX_ENTRIES; i++)
      expect((await add(`n${i}`, i)).status).toBe(201);
    expect((await add("a mais")).status).toBe(409);
  });

  it("passa a vez e conta as rodadas", async () => {
    await add("Kira", 17);
    await add("Dex", 14);
    await add("Guarda", 9);
    expect((await init("POST", "/next")).status).toBe(409);
    const started = (await init("POST", "/start")).body;
    expect(started).toMatchObject({ round: 1 });
    const order = started.entries.map((e) => e.name);
    expect(order).toEqual(["Kira", "Dex", "Guarda"]);
    const turn = async () => {
      const v = (await init("POST", "/next")).body;
      return [v.round, v.entries.find((e) => e.id === v.activeId)?.name];
    };
    expect(started.entries.find((e) => e.id === started.activeId)?.name).toBe("Kira");
    expect(await turn()).toEqual([1, "Dex"]);
    expect(await turn()).toEqual([1, "Guarda"]);
    expect(await turn()).toEqual([2, "Kira"]);
    expect(await turn()).toEqual([2, "Dex"]);
    const ended = (await init("POST", "/end")).body;
    expect(ended).toMatchObject({ round: 0, activeId: null });
    expect(ended.entries).toHaveLength(3);
    expect((await init("POST", "/next")).status).toBe(409);
  });

  it("não começa combate sem ninguém; limpar esvazia tudo", async () => {
    expect((await init("POST", "/start")).status).toBe(409);
    await add("Kira", 17);
    await init("POST", "/start");
    expect((await init("POST", "/clear")).body).toMatchObject({
      round: 0,
      activeId: null,
      entries: [],
    });
  });

  it("remover quem está na vez passa a vez para o seguinte", async () => {
    await add("Kira", 17);
    const dex = (await add("Dex", 14)).body.entries[1]!;
    await add("Guarda", 9);
    await init("POST", "/start");
    await init("POST", "/next");
    const afterRemove = (await init("DELETE", `/entries/${dex.id}`)).body;
    expect(afterRemove.entries.find((e) => e.id === afterRemove.activeId)?.name).toBe("Guarda");
    expect((await init("DELETE", `/entries/${dex.id}`)).status).toBe(404);
    // Se era a última da ordem, a vez volta ao começo.
    const guarda = afterRemove.entries.find((e) => e.name === "Guarda")!;
    const after = (await init("DELETE", `/entries/${guarda.id}`)).body;
    expect(after.entries.find((e) => e.id === after.activeId)?.name).toBe("Kira");
  });

  it("jogador recebe só a ordem: sem valores e sem entradas ocultas, ao vivo", async () => {
    const player = await open(rita);
    const master = await open(gm);
    const playerGets = record(player.client, "initiative:set");
    const masterGets = record(master.client, "initiative:set");
    await add("Kira", 17);
    await add("Emboscada", 12, { hidden: true });
    await add("Guarda", 9);
    await settle();
    const last = playerGets.at(-1)![0];
    expect(last.entries.map((e) => e.name)).toEqual(["Kira", "Guarda"]);
    expect(last.entries.every((e) => e.value === null)).toBe(true);
    expect(masterGets.at(-1)![0].entries.map((e) => [e.name, e.value])).toEqual([
      ["Kira", 17],
      ["Emboscada", 12],
      ["Guarda", 9],
    ]);
    // Na vez uma entrada oculta: o jogador não vê quem é.
    await init("POST", "/start");
    await init("POST", "/next");
    await settle();
    expect(playerGets.at(-1)![0].activeId).toBeNull();
    expect(masterGets.at(-1)![0].activeId).not.toBeNull();
    // Snapshot segue a mesma regra.
    const fresh = (await open(rita)).snapshot.initiative;
    expect(fresh.entries.map((e) => e.name)).toEqual(["Kira", "Guarda"]);
    expect(JSON.stringify(fresh)).not.toContain("Emboscada");
    expect((await open(gm)).snapshot.initiative.entries).toHaveLength(3);
  });

  it("monta entradas a partir de tokens, sem repetir", async () => {
    const scene = (
      await api<SceneSummary[]>(server, "POST", "/api/scenes", { cookie: gm, body: { name: "A" } })
    ).body[0]!;
    const make = (name: string, extra: object = {}) =>
      api<TokenView>(server, "POST", "/api/tokens", {
        cookie: gm,
        body: { sceneId: scene.id, name, x: 10, y: 10, ...extra },
      });
    const a = (await make("Kira")).body;
    const b = (await make("Atirador", { hidden: true })).body;
    const first = (await init("POST", "/from-tokens", { tokenIds: [a.id, b.id, 9999] })).body;
    expect(first.entries.map((e) => [e.name, e.hidden, e.tokenId])).toEqual([
      ["Kira", false, a.id],
      ["Atirador", true, b.id],
    ]);
    const again = (await init("POST", "/from-tokens", { tokenIds: [a.id] })).body;
    expect(again.entries).toHaveLength(2);
    expect((await init("POST", "/from-tokens", { tokenIds: "x" })).status).toBe(400);
  });

  it("rola 1d10 + REF da ficha ligada ao token, e a rolagem vai para o histórico", async () => {
    const scene = (
      await api<SceneSummary[]>(server, "POST", "/api/scenes", { cookie: gm, body: { name: "A" } })
    ).body[0]!;
    const npc = (
      await api<CharacterView>(server, "POST", "/api/characters", {
        cookie: gm,
        body: { data: { handle: "Guarda", stats: { REF: 7 } } },
      })
    ).body;
    const guard = (
      await api<TokenView>(server, "POST", "/api/tokens", {
        cookie: gm,
        body: { sceneId: scene.id, name: "Guarda", x: 1, y: 1, characterId: npc.id },
      })
    ).body;
    const ambush = (
      await api<TokenView>(server, "POST", "/api/tokens", {
        cookie: gm,
        body: {
          sceneId: scene.id,
          name: "Atirador",
          x: 1,
          y: 1,
          hidden: true,
          characterId: npc.id,
        },
      })
    ).body;
    await init("POST", "/from-tokens", { tokenIds: [guard.id, ambush.id] });
    await add("Kira", 15);
    const player = await open(rita);
    const playerRolls: RollResult[] = [];
    player.client.on("dice:result", (r) => playerRolls.push(r));

    const view = (await init("POST", "/roll")).body;
    await settle();
    const guardEntry = view.entries.find((e) => e.name === "Guarda")!;
    expect(guardEntry.value).toBeGreaterThanOrEqual(8);
    expect(guardEntry.value).toBeLessThanOrEqual(17);
    // Quem já tinha valor não é rolado de novo.
    expect(view.entries.find((e) => e.name === "Kira")!.value).toBe(15);
    // Só a rolagem da entrada visível chega ao jogador; a da oculta é secreta.
    expect(playerRolls.map((r) => r.label)).toEqual(["Iniciativa: Guarda"]);
    const log = (await open(gm)).snapshot.rolls;
    expect(log.map((r) => [r.label, r.secret])).toEqual([
      ["Iniciativa: Guarda", false],
      ["Iniciativa: Atirador", true],
    ]);
    expect((await open(rita)).snapshot.rolls.map((r) => r.label)).toEqual(["Iniciativa: Guarda"]);
  });
});
