import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkExpression,
  CHARACTER_LIMITS,
  DEFAULT_SKILLS,
  deathSave,
  emptyCharacter,
  humanityMax,
  maxHp,
  parseDice,
  sanitizeCharacter,
  seriouslyWoundedAt,
  skillTotal,
  woundState,
  type ApiError,
  type CharacterData,
  type CharacterReply,
  type CharacterView,
  type ClientToServerEvents,
  type LoginResponse,
  type SceneSummary,
  type ServerToClientEvents,
  type StateSnapshot,
  type TokenView,
} from "@vtt/shared";
import { api, startServer, type TestServer } from "./helpers.js";

describe("regras da ficha", () => {
  const sheet = (body: number, will: number, emp = 5): CharacterData => {
    const data = emptyCharacter();
    data.stats.BODY = body;
    data.stats.WILL = will;
    data.stats.EMP = emp;
    return data;
  };

  it("HP: 10 + 5 × média de BODY e WILL arredondada para cima", () => {
    expect(maxHp(sheet(6, 6))).toBe(40);
    expect(maxHp(sheet(5, 4))).toBe(35);
    expect(maxHp(sheet(2, 2))).toBe(20);
    expect(maxHp(sheet(8, 8))).toBe(50);
    expect(maxHp(sheet(7, 6))).toBe(45);
  });

  it("ferido gravemente na metade do HP (para cima), mortal em zero", () => {
    const data = sheet(6, 6);
    expect(seriouslyWoundedAt(data)).toBe(20);
    expect(woundState({ ...data, hpCurrent: 40 })).toBe("ok");
    expect(woundState({ ...data, hpCurrent: 21 })).toBe("ok");
    expect(woundState({ ...data, hpCurrent: 20 })).toBe("serious");
    expect(woundState({ ...data, hpCurrent: 1 })).toBe("serious");
    expect(woundState({ ...data, hpCurrent: 0 })).toBe("mortal");
    expect(seriouslyWoundedAt(sheet(5, 4))).toBe(18);
  });

  it("Humanity máxima é EMP × 10 e o Death Save usa BODY", () => {
    expect(humanityMax(sheet(5, 5, 7))).toBe(70);
    expect(deathSave(sheet(9, 5))).toBe(9);
  });

  it("teste de skill: STAT + nível, em expressão de dado", () => {
    const data = sheet(5, 5);
    data.stats.REF = 7;
    const total = skillTotal(data, { name: "Handgun", stat: "REF", level: 4 });
    expect(total).toBe(11);
    expect(checkExpression(total)).toBe("1d10!+11");
    expect(checkExpression(-2)).toBe("1d10!-2");
    expect(parseDice(checkExpression(total)).ok).toBe(true);
    expect(parseDice(checkExpression(-2)).ok).toBe(true);
  });

  it("ficha nova começa com HP, Humanity e Luck cheios", () => {
    const data = emptyCharacter();
    expect(data.hpCurrent).toBe(maxHp(data));
    expect(data.humanityCurrent).toBe(humanityMax(data));
    expect(data.luckCurrent).toBe(data.stats.LUCK);
  });

  it("a lista de skills padrão não repete nome e liga cada uma a um STAT", () => {
    const names = DEFAULT_SKILLS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    expect(DEFAULT_SKILLS.every((s) => s.level === 0)).toBe(true);
    expect(DEFAULT_SKILLS.find((s) => s.name === "Handgun")?.stat).toBe("REF");
  });
});

describe("validação da ficha", () => {
  it("aceita lixo e devolve uma ficha completa e válida", () => {
    for (const junk of [null, undefined, 5, "texto", [], { stats: 7 }]) {
      const data = sanitizeCharacter(junk);
      expect(Object.keys(data.stats)).toHaveLength(10);
      expect(data.skills).toEqual([]);
    }
  });

  it("limita números, tira controles e descarta itens sem nome", () => {
    const data = sanitizeCharacter({
      handle: "  Kira\u0000\u0007 ",
      rank: 99,
      stats: { BODY: 500, WILL: -4, INT: "x", EXTRA: 9 },
      hpCurrent: 1e9,
      humanityCurrent: -5,
      eddies: 1.9,
      skills: [
        { name: "Handgun", stat: "REF", level: 99 },
        { name: "  ", stat: "REF", level: 1 },
        { name: "Falsa", stat: "XYZ", level: 2 },
        "não é objeto",
      ],
      weapons: [{ name: "Pistola", damage: "3d6", rof: 50, ammo: -1 }, { damage: "1d6" }],
      gear: [{ name: "Corda", qty: "muitas" }],
      notes: "linha 1\nlinha 2\u0000",
    });
    expect(data.handle).toBe("Kira");
    expect(data.rank).toBe(10);
    expect(data.stats.BODY).toBe(CHARACTER_LIMITS.stat);
    expect(data.stats.WILL).toBe(0);
    expect(data.stats.INT).toBe(5);
    expect(data.stats).not.toHaveProperty("EXTRA");
    expect(data.hpCurrent).toBe(maxHp(data));
    expect(data.humanityCurrent).toBe(0);
    expect(data.eddies).toBe(1);
    expect(data.skills).toEqual([
      { name: "Handgun", stat: "REF", level: 10 },
      { name: "Falsa", stat: "INT", level: 2 },
    ]);
    expect(data.weapons).toHaveLength(1);
    expect(data.weapons[0]).toMatchObject({ rof: 10, ammo: 0 });
    expect(data.gear[0]).toMatchObject({ name: "Corda", qty: 1 });
    expect(data.notes).toBe("linha 1\nlinha 2");
  });

  it("corta listas e textos nos limites", () => {
    const data = sanitizeCharacter({
      skills: Array.from({ length: 500 }, (_, i) => ({ name: `s${i}`, stat: "INT", level: 1 })),
      notes: "x".repeat(10_000),
      handle: "h".repeat(500),
    });
    expect(data.skills).toHaveLength(CHARACTER_LIMITS.skills);
    expect(data.notes).toHaveLength(CHARACTER_LIMITS.textLong);
    expect(data.handle).toHaveLength(40);
  });
});

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let server: TestServer;
let gm: string;
let rita: string;
let ritaId: number;
let sam: string;
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
  sam = (await api(server, "POST", "/api/login", { body: { name: "Sam" } })).cookie!;
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
const patch = (client: Client, id: number, data: Partial<CharacterData>) =>
  new Promise<CharacterReply>((resolve) => client.emit("character:patch", id, data, resolve));
const settle = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));
const createCharacter = (cookie: string, body: object = {}) =>
  api<CharacterView & ApiError>(server, "POST", "/api/characters", { cookie, body });

describe("criar e entregar fichas", () => {
  it("o jogador cria a própria ficha, uma só; o mestre cria para quem quiser ou para NPC", async () => {
    const mine = await createCharacter(rita, { ownerId: 999, data: { handle: "Kira" } });
    expect(mine.status).toBe(201);
    // O jogador não escolhe o dono.
    expect(mine.body).toMatchObject({ ownerId: ritaId });
    expect(mine.body.data.handle).toBe("Kira");
    expect((await createCharacter(rita)).status).toBe(409);

    const npc = await createCharacter(gm);
    expect(npc.body.ownerId).toBeNull();
    const forSam = await createCharacter(gm, { ownerId: ritaId });
    expect(forSam.body.ownerId).toBe(ritaId);
    expect((await createCharacter(gm, { ownerId: 999 })).status).toBe(400);
    expect((await createCharacter(gm, { ownerId: "x" })).status).toBe(400);
    expect((await createCharacter(server.url && "", {})).status).toBe(401);
  });

  it("o snapshot traz todas as fichas ao mestre e só as próprias ao jogador", async () => {
    await createCharacter(rita, { data: { handle: "Kira" } });
    await createCharacter(gm, { data: { handle: "Guarda" } });
    await createCharacter(sam, { data: { handle: "Dex" } });
    expect((await open(gm)).snapshot.characters.map((c) => c.data.handle)).toEqual([
      "Kira",
      "Guarda",
      "Dex",
    ]);
    expect((await open(rita)).snapshot.characters.map((c) => c.data.handle)).toEqual(["Kira"]);
  });

  it("ficha nova chega ao vivo ao mestre e ao dono, não aos outros", async () => {
    const master = await open(gm);
    const owner = await open(rita);
    const other = await open(sam);
    const masterGets = record(master.client, "character:update");
    const ownerGets = record(owner.client, "character:update");
    const otherGets = record(other.client, "character:update");
    await createCharacter(rita, { data: { handle: "Kira" } });
    await settle();
    expect(masterGets).toHaveLength(1);
    expect(ownerGets).toHaveLength(1);
    expect(otherGets).toHaveLength(0);
  });

  it("o mestre passa a ficha para outro jogador e o antigo dono a perde", async () => {
    const created = (await createCharacter(rita, { data: { handle: "Kira" } })).body;
    const samId = (
      await api<LoginResponse>(server, "POST", "/api/login", { body: { name: "Sam" } })
    ).body.user.id;
    const oldOwner = await open(rita);
    const newOwner = await open(sam);
    const removed = record(oldOwner.client, "character:remove");
    const received = record(newOwner.client, "character:update");
    const res = await api(server, "PATCH", `/api/characters/${created.id}`, {
      cookie: gm,
      body: { ownerId: samId },
    });
    expect(res.status).toBe(200);
    await settle();
    expect(removed.map(([id]) => id)).toEqual([created.id]);
    expect(received).toHaveLength(1);
    expect(
      (
        await api(server, "PATCH", `/api/characters/${created.id}`, {
          cookie: rita,
          body: { ownerId: null },
        })
      ).status,
    ).toBe(403);
    expect(
      (await api(server, "PATCH", "/api/characters/999", { cookie: gm, body: { ownerId: null } }))
        .status,
    ).toBe(404);
  });

  it("só o mestre apaga; jogador não", async () => {
    const created = (await createCharacter(rita)).body;
    expect(
      (await api(server, "DELETE", `/api/characters/${created.id}`, { cookie: rita })).status,
    ).toBe(403);
    const owner = await open(rita);
    const removed = record(owner.client, "character:remove");
    expect(
      (await api(server, "DELETE", `/api/characters/${created.id}`, { cookie: gm })).status,
    ).toBe(204);
    await settle();
    expect(removed).toHaveLength(1);
    expect(
      (await api(server, "DELETE", `/api/characters/${created.id}`, { cookie: gm })).status,
    ).toBe(404);
  });

  it("expulsar o jogador deixa a ficha sem dono e avisa o mestre", async () => {
    const created = (await createCharacter(rita)).body;
    const master = await open(gm);
    const updates = record(master.client, "character:update");
    await api(server, "DELETE", `/api/users/${ritaId}`, { cookie: gm });
    await settle();
    expect(updates.at(-1)![0]).toMatchObject({ id: created.id, ownerId: null });
  });
});

describe("autosave da ficha", () => {
  it("o dono salva, recebe a ficha validada e o mestre vê ao vivo", async () => {
    const created = (await createCharacter(rita, { data: { handle: "Kira" } })).body;
    const owner = await open(rita);
    const master = await open(gm);
    const other = await open(sam);
    const masterGets = record(master.client, "character:update");
    const otherGets = record(other.client, "character:update");
    const ownerGets = record(owner.client, "character:update");

    const reply = await patch(owner.client, created.id, {
      role: "Solo",
      stats: { ...created.data.stats, REF: 99 },
      eddies: 250,
    });
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;
    expect(reply.character.data).toMatchObject({ role: "Solo", handle: "Kira", eddies: 250 });
    expect(reply.character.data.stats.REF).toBe(CHARACTER_LIMITS.stat);
    await settle();
    expect(masterGets).toHaveLength(1);
    expect(otherGets).toHaveLength(0);
    expect(ownerGets).toHaveLength(0);
    expect((await open(rita)).snapshot.characters[0]!.data.role).toBe("Solo");
  });

  it("outro jogador não edita; o mestre edita qualquer uma", async () => {
    const created = (await createCharacter(rita, { data: { handle: "Kira" } })).body;
    const intruder = await open(sam);
    expect(await patch(intruder.client, created.id, { handle: "Hack" })).toEqual({
      ok: false,
      error: "Você não pode editar essa ficha",
    });
    const master = await open(gm);
    const ok = await patch(master.client, created.id, { handle: "Kira V." });
    expect(ok.ok && ok.character.data.handle).toBe("Kira V.");
    expect((await patch(master.client, 9999, {})).ok).toBe(false);
    expect((await patch(master.client, "x" as unknown as number, {})).ok).toBe(false);
  });

  it("ignora campos desconhecidos e mantém o que não foi enviado", async () => {
    const created = (await createCharacter(rita, { data: { handle: "Kira", role: "Solo" } })).body;
    const owner = await open(rita);
    const reply = await patch(owner.client, created.id, {
      notes: "oi",
      evil: "x",
    } as Partial<CharacterData>);
    expect(reply.ok && reply.character.data).toMatchObject({
      handle: "Kira",
      role: "Solo",
      notes: "oi",
    });
    expect(reply.ok && reply.character.data).not.toHaveProperty("evil");
  });
});

describe("HP no token", () => {
  let scene: SceneSummary;
  const makeToken = (body: object) =>
    api<TokenView & ApiError>(server, "POST", "/api/tokens", {
      cookie: gm,
      body: { sceneId: scene.id, name: "Token", x: 100, y: 100, ...body },
    });

  beforeEach(async () => {
    scene = (
      await api<SceneSummary[]>(server, "POST", "/api/scenes", { cookie: gm, body: { name: "A" } })
    ).body[0]!;
  });

  it("token de personagem mostra o HP a todos; o de NPC só ao mestre", async () => {
    const pc = (await createCharacter(rita, { data: { stats: { BODY: 6, WILL: 6 } } })).body;
    const npc = (await createCharacter(gm, { data: { stats: { BODY: 8, WILL: 8 } } })).body;
    const t1 = (await makeToken({ name: "Kira", characterId: pc.id })).body;
    const t2 = (await makeToken({ name: "Guarda", characterId: npc.id })).body;
    expect(t1.hp).toEqual({ current: 40, max: 40 });
    expect(t2.hp).toEqual({ current: 50, max: 50 });

    const player = await open(sam);
    expect(player.snapshot.tokens.find((t) => t.name === "Kira")?.hp).toEqual({
      current: 40,
      max: 40,
    });
    expect(player.snapshot.tokens.find((t) => t.name === "Guarda")?.hp).toBeNull();
    expect(player.snapshot.tokens.find((t) => t.name === "Guarda")?.characterId).toBe(npc.id);
    const master = await open(gm);
    expect(master.snapshot.tokens.find((t) => t.name === "Guarda")?.hp).toEqual({
      current: 50,
      max: 50,
    });
  });

  it("mudar o HP na ficha atualiza o token ao vivo, sem vazar o HP de NPC", async () => {
    const pc = (await createCharacter(rita, { data: { stats: { BODY: 6, WILL: 6 } } })).body;
    const npc = (await createCharacter(gm, { data: { stats: { BODY: 8, WILL: 8 } } })).body;
    await makeToken({ name: "Kira", characterId: pc.id });
    await makeToken({ name: "Guarda", characterId: npc.id });
    const owner = await open(rita);
    const other = await open(sam);
    const master = await open(gm);
    const otherUps = record(other.client, "token:upsert");
    const masterUps = record(master.client, "token:upsert");

    await patch(owner.client, pc.id, { hpCurrent: 12 });
    await patch(master.client, npc.id, { hpCurrent: 7 });
    await settle();
    expect(otherUps.map(([t]) => [t.name, t.hp])).toEqual([
      ["Kira", { current: 12, max: 40 }],
      ["Guarda", null],
    ]);
    expect(masterUps.map(([t]) => [t.name, t.hp])).toEqual([
      ["Kira", { current: 12, max: 40 }],
      ["Guarda", { current: 7, max: 50 }],
    ]);
  });

  it("apagar a ficha tira o HP do token; ligar a ficha que não existe é recusado", async () => {
    const pc = (await createCharacter(rita)).body;
    const token = (await makeToken({ characterId: pc.id })).body;
    expect((await makeToken({ characterId: 999 })).status).toBe(400);
    const other = await open(sam);
    const ups = record(other.client, "token:upsert");
    await api(server, "DELETE", `/api/characters/${pc.id}`, { cookie: gm });
    await settle();
    expect(ups.at(-1)![0]).toMatchObject({ id: token.id, characterId: null, hp: null });
  });

  it("trocar o dono da ficha de NPC para jogador libera o HP aos jogadores", async () => {
    const npc = (await createCharacter(gm)).body;
    await makeToken({ name: "Aliado", characterId: npc.id });
    const other = await open(sam);
    const ups = record(other.client, "token:upsert");
    await api(server, "PATCH", `/api/characters/${npc.id}`, {
      cookie: gm,
      body: { ownerId: ritaId },
    });
    await settle();
    expect(ups.at(-1)![0].hp).toEqual({ current: maxHp(npc.data), max: maxHp(npc.data) });
  });
});
