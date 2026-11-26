import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  formatTerms,
  parseDice,
  rollTerms,
  type ClientToServerEvents,
  type RollReply,
  type RollRequest,
  type RollResult,
  type ServerToClientEvents,
  type StateSnapshot,
} from "@vtt/shared";
import { api, startServer, type TestServer } from "./helpers.js";

/** Gerador que devolve valores combinados, na ordem. */
const fixed = (...values: number[]) => {
  const queue = [...values];
  return (max: number): number => {
    const v = queue.shift();
    if (v === undefined) throw new Error("faltou valor no gerador de teste");
    expect(v).toBeGreaterThanOrEqual(1);
    expect(v).toBeLessThanOrEqual(max);
    return v;
  };
};

const parse = (text: string) => {
  const parsed = parseDice(text);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed;
};

describe("leitura de expressões", () => {
  it("entende dados, números, sinais, espaços e maiúsculas", () => {
    expect(parse("2d6+3").normalized).toBe("2d6+3");
    expect(parse(" D20 - 1 + 2D4 ").normalized).toBe("1d20-1+2d4");
    expect(parse("-1d6+10").normalized).toBe("-1d6+10");
    expect(parse("1d10!+8").terms[0]).toMatchObject({ test: true, count: 1, sides: 10 });
    expect(formatTerms(parse("3d8+2d6-4").terms)).toBe("3d8+2d6-4");
  });

  it("recusa o que não é rolagem, com mensagem em português", () => {
    for (const bad of [
      "",
      "   ",
      "abc",
      "2d",
      "d",
      "5",
      "3+4",
      "2d6++3",
      "2d6 3",
      "2d6+",
      "1d1",
      "0d6",
      "101d6",
      "1d1001",
      "2d10!",
      "1d6!",
      "1d10!!",
      "2d6*2",
      "1d6+" + "1+".repeat(25) + "1",
      "x".repeat(101),
      "1d6+99999999999",
    ]) {
      const parsed = parseDice(bad);
      expect(parsed.ok, bad).toBe(false);
      if (!parsed.ok) expect(parsed.error.length).toBeGreaterThan(5);
    }
  });
});

describe("regras de rolagem", () => {
  it("soma os dados e o modificador", () => {
    const out = rollTerms(parse("2d6+3").terms, fixed(4, 5));
    expect(out.total).toBe(12);
    expect(out.critical).toBe(false);
    expect(out.terms[0]).toMatchObject({ rolls: [4, 5], subtotal: 9 });
  });

  it("termos negativos subtraem", () => {
    expect(rollTerms(parse("1d8-1d4-2").terms, fixed(7, 3)).total).toBe(2);
  });

  it("teste do RED: 10 natural soma outro d10", () => {
    const out = rollTerms(parse("1d10!+8").terms, fixed(10, 6));
    expect(out.total).toBe(24);
    expect(out.terms[0]).toMatchObject({ rolls: [10, 6], testEffect: "explode", subtotal: 16 });
  });

  it("teste do RED: 1 natural subtrai outro d10", () => {
    const out = rollTerms(parse("1d10!+8").terms, fixed(1, 6));
    expect(out.total).toBe(3);
    expect(out.terms[0]).toMatchObject({ rolls: [1, 6], testEffect: "fumble", subtotal: -5 });
  });

  it("teste do RED: o dado extra não explode de novo", () => {
    expect(rollTerms(parse("1d10!").terms, fixed(10, 10)).total).toBe(20);
    expect(rollTerms(parse("1d10!").terms, fixed(1, 10)).total).toBe(-9);
  });

  it("valores comuns de d10 não disparam nada, e d10 sem ! nunca explode", () => {
    const common = rollTerms(parse("1d10!+2").terms, fixed(7));
    expect(common.total).toBe(9);
    expect(common.terms[0]).not.toHaveProperty("testEffect");
    const plain = rollTerms(parse("1d10+2").terms, fixed(10));
    expect(plain.total).toBe(12);
  });

  it("dano: dois ou mais 6 num grupo de d6 é crítico", () => {
    expect(rollTerms(parse("3d6").terms, fixed(6, 2, 6)).critical).toBe(true);
    expect(rollTerms(parse("3d6").terms, fixed(6, 2, 5)).critical).toBe(false);
    expect(rollTerms(parse("2d6").terms, fixed(6, 6)).critical).toBe(true);
    expect(rollTerms(parse("1d6").terms, fixed(6)).critical).toBe(false);
    expect(rollTerms(parse("2d8").terms, fixed(6, 6)).critical).toBe(false);
  });

  it("os dados caem em todos os valores possíveis (gerador do sistema)", async () => {
    const { secureRandomInt } = await import("../src/dice.js");
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = secureRandomInt(10);
      expect(Number.isInteger(v) && v >= 1 && v <= 10).toBe(true);
      seen.add(v);
    }
    expect(seen.size).toBe(10);
  });
});

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let server: TestServer;
let gm: string;
let rita: string;
let sam: string;
const clients: Client[] = [];

beforeEach(async () => {
  server = await startServer();
  gm = (
    await api(server, "POST", "/api/login", {
      body: { name: "Mestre", gm: true, password: "senha-do-mestre" },
    })
  ).cookie!;
  rita = (await api(server, "POST", "/api/login", { body: { name: "Rita" } })).cookie!;
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
const roll = (client: Client, request: RollRequest) =>
  new Promise<RollReply>((resolve) => client.emit("dice:roll", request, resolve));
const results = (client: Client) => {
  const list: RollResult[] = [];
  client.on("dice:result", (r) => list.push(r));
  return list;
};
const settle = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));

describe("rolagem na mesa", () => {
  it("o jogador rola; o resultado volta para ele e chega a todos", async () => {
    const player = await open(rita);
    const other = await open(sam);
    const master = await open(gm);
    const otherGets = results(other.client);
    const masterGets = results(master.client);
    const ownGets = results(player.client);

    const reply = await roll(player.client, { expression: " 2d6 + 3 ", label: "Pistola" });
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;
    expect(reply.roll).toMatchObject({
      userName: "Rita",
      expression: "2d6+3",
      label: "Pistola",
      secret: false,
    });
    expect(reply.roll.total).toBe(reply.roll.terms.reduce((sum, t) => sum + t.subtotal, 0));
    expect(reply.roll.terms[0]).toMatchObject({ kind: "dice", count: 2 });
    await settle();
    expect(otherGets.map((r) => r.id)).toEqual([reply.roll.id]);
    expect(masterGets.map((r) => r.id)).toEqual([reply.roll.id]);
    // Quem rolou recebe pela resposta, sem duplicar.
    expect(ownGets).toHaveLength(0);
  });

  it("rolagem secreta só aparece para o mestre", async () => {
    const player = await open(rita);
    const master = await open(gm);
    const second = await open(gm);
    const playerGets = results(player.client);
    const secondGets = results(second.client);
    const reply = await roll(master.client, { expression: "1d20", secret: true });
    expect(reply.ok && reply.roll.secret).toBe(true);
    await settle();
    expect(playerGets).toHaveLength(0);
    expect(secondGets).toHaveLength(1);
  });

  it("jogador não faz rolagem secreta", async () => {
    const player = await open(rita);
    const master = await open(gm);
    const masterGets = results(master.client);
    const reply = await roll(player.client, { expression: "1d20", secret: true });
    expect(reply).toEqual({ ok: false, error: "Só o mestre faz rolagem secreta" });
    await settle();
    expect(masterGets).toHaveLength(0);
  });

  it("devolve o erro da expressão e não grava nada", async () => {
    const player = await open(rita);
    for (const request of [
      { expression: "oi" },
      { expression: "" },
      { expression: 5 },
      null,
    ] as unknown as RollRequest[]) {
      const reply = await roll(player.client, request);
      expect(reply.ok).toBe(false);
    }
    expect((await open(rita)).snapshot.rolls).toEqual([]);
  });

  it("o histórico acompanha o snapshot, sem as secretas para jogadores", async () => {
    const master = await open(gm);
    await roll(master.client, { expression: "1d6" });
    await roll(master.client, { expression: "1d8", secret: true });
    const player = await open(rita);
    await roll(player.client, { expression: "1d10!+2" });
    const playerView = (await open(sam)).snapshot.rolls;
    expect(playerView.map((r) => r.expression)).toEqual(["1d6", "1d10!+2"]);
    const masterView = (await open(gm)).snapshot.rolls;
    expect(masterView.map((r) => r.expression)).toEqual(["1d6", "1d8", "1d10!+2"]);
    expect(masterView[1]).toMatchObject({ secret: true, userName: "Mestre" });
  });

  it("segura quem rola rápido demais e guarda só as últimas 50 no snapshot", async () => {
    const player = await open(rita);
    const replies = await Promise.all(
      Array.from({ length: 12 }, () => roll(player.client, { expression: "1d4" })),
    );
    expect(replies.filter((r) => r.ok)).toHaveLength(8);
    expect(replies.find((r) => !r.ok)).toMatchObject({ error: expect.stringContaining("Calma") });
    for (let batch = 0; batch < 8; batch++) {
      await settle(1050);
      await Promise.all(
        Array.from({ length: 8 }, () => roll(player.client, { expression: "1d4" })),
      );
    }
    expect((await open(sam)).snapshot.rolls.length).toBe(50);
  }, 30_000);

  it("o nome fica no histórico mesmo depois de o jogador sair", async () => {
    const player = await open(rita);
    await roll(player.client, { expression: "1d6" });
    const users = (
      await api<{ id: number; name: string }[]>(server, "GET", "/api/users", { cookie: gm })
    ).body;
    const ritaId = users.find((u) => u.name === "Rita")!.id;
    await api(server, "DELETE", `/api/users/${ritaId}`, { cookie: gm });
    expect((await open(gm)).snapshot.rolls[0]).toMatchObject({ userName: "Rita" });
  });
});
