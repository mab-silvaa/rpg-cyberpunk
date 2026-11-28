import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ApiError, LoginResponse, PresenceUser, TunnelInfo } from "@vtt/shared";
import { api, startServer, type TestServer } from "./helpers.js";

let server: TestServer;
beforeEach(async () => {
  server = await startServer();
});
afterEach(async () => {
  await server.stop();
});

const loginPlayer = (name: string, cookie?: string) =>
  api<LoginResponse & ApiError>(server, "POST", "/api/login", { body: { name }, cookie });
const loginGm = (name = "Mestre", password = "senha-do-mestre") =>
  api<LoginResponse & ApiError>(server, "POST", "/api/login", {
    body: { name, gm: true, password },
  });

describe("login de jogador", () => {
  it("entra só com o nome e recebe uma sessão que vale em /api/me", async () => {
    const login = await loginPlayer("  Rita   Silva ");
    expect(login.status).toBe(200);
    expect(login.body.user).toMatchObject({ name: "Rita Silva", isGm: false });
    expect(login.cookie).toMatch(/^vtt_session=/);

    const me = await api<LoginResponse>(server, "GET", "/api/me", { cookie: login.cookie });
    expect(me.status).toBe(200);
    expect(me.body.user.name).toBe("Rita Silva");
  });

  it("recusa nomes vazios e longos demais", async () => {
    expect((await loginPlayer("   ")).status).toBe(400);
    expect((await loginPlayer("x")).status).toBe(400);
    expect((await loginPlayer("x".repeat(25))).status).toBe(400);
    expect((await loginPlayer("x".repeat(24))).status).toBe(200);
  });

  it("a sessão não vale se o cookie for adulterado", async () => {
    const login = await loginPlayer("Rita");
    const forged = login.cookie!.replace(/\.[^.]*$/, ".assinatura-falsa");
    expect((await api(server, "GET", "/api/me", { cookie: forged })).status).toBe(401);
    expect((await api(server, "GET", "/api/me")).status).toBe(401);
  });

  it("reencontra o jogador pelo nome sem diferenciar maiúsculas", async () => {
    const first = await loginPlayer("Rita");
    const again = await loginPlayer("rita");
    expect(again.status).toBe(200);
    expect(again.body.user.id).toBe(first.body.user.id);
  });

  it("recusa o nome de quem está conectado com outra sessão", async () => {
    const first = await loginPlayer("Rita");
    const sock = (await import("socket.io-client")).io(server.url, {
      transports: ["websocket"],
      extraHeaders: { cookie: first.cookie! },
    });
    await new Promise((resolve) => sock.once("server:hello", resolve));
    try {
      const other = await loginPlayer("Rita");
      expect(other.status).toBe(409);
      // quem já tem a sessão da Rita pode entrar de novo, por exemplo em outra aba
      expect((await loginPlayer("Rita", first.cookie)).status).toBe(200);
    } finally {
      sock.disconnect();
    }
  });
});

describe("login do mestre", () => {
  it("entra com a senha certa", async () => {
    const login = await loginGm();
    expect(login.status).toBe(200);
    expect(login.body.user.isGm).toBe(true);
  });

  it("recusa senha errada e o nome do mestre sem senha", async () => {
    expect((await loginGm("Mestre", "errada")).status).toBe(401);
    await loginGm();
    const impostor = await loginPlayer("Mestre");
    expect(impostor.status).toBe(403);
  });

  it("fica desativado se a senha não foi configurada", async () => {
    await server.stop();
    server = await startServer({ gmPassword: "" });
    expect((await loginGm("Mestre", "")).status).toBe(503);
  });

  it("bloqueia o IP depois de 5 senhas erradas, mesmo que a sexta esteja certa", async () => {
    for (let i = 0; i < 5; i++) expect((await loginGm("Mestre", "errada")).status).toBe(401);
    expect((await loginGm("Mestre", "senha-do-mestre")).status).toBe(429);
    // jogadores não são afetados
    expect((await loginPlayer("Rita")).status).toBe(200);
  });
});

describe("administração de usuários", () => {
  it("cada jogador renomeia só a si mesmo", async () => {
    const rita = await loginPlayer("Rita");
    const bruno = await loginPlayer("Bruno");
    const own = await api<PresenceUser[]>(server, "PATCH", `/api/users/${rita.body.user.id}`, {
      cookie: rita.cookie,
      body: { name: "Rita V" },
    });
    expect(own.status).toBe(200);
    expect(own.body.map((u) => u.name)).toContain("Rita V");
    const clash = await api(server, "PATCH", `/api/users/${rita.body.user.id}`, {
      cookie: rita.cookie,
      body: { name: "bruno" },
    });
    expect(clash.status).toBe(409);
    const other = await api(server, "PATCH", `/api/users/${bruno.body.user.id}`, {
      cookie: rita.cookie,
      body: { name: "Outro" },
    });
    expect(other.status).toBe(403);
  });

  it("só o mestre renomeia e expulsa", async () => {
    const gm = await loginGm();
    const rita = await loginPlayer("Rita");
    const bruno = await loginPlayer("Bruno");
    const ritaId = rita.body.user.id;

    expect(
      (
        await api(server, "PATCH", `/api/users/${ritaId}`, {
          cookie: bruno.cookie,
          body: { name: "X" },
        })
      ).status,
    ).toBe(403);
    expect(
      (await api(server, "DELETE", `/api/users/${ritaId}`, { cookie: bruno.cookie })).status,
    ).toBe(403);

    const renamed = await api<PresenceUser[]>(server, "PATCH", `/api/users/${ritaId}`, {
      cookie: gm.cookie,
      body: { name: "Rita V" },
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.map((u) => u.name)).toEqual(["Mestre", "Rita V", "Bruno"]);

    const clash = await api(server, "PATCH", `/api/users/${ritaId}`, {
      cookie: gm.cookie,
      body: { name: "bruno" },
    });
    expect(clash.status).toBe(409);

    expect(
      (await api(server, "DELETE", `/api/users/${ritaId}`, { cookie: gm.cookie })).status,
    ).toBe(204);
    expect((await api(server, "GET", "/api/me", { cookie: rita.cookie })).status).toBe(401);
  });

  it("o mestre não pode expulsar a si mesmo", async () => {
    const gm = await loginGm();
    const res = await api(server, "DELETE", `/api/users/${gm.body.user.id}`, { cookie: gm.cookie });
    expect(res.status).toBe(400);
  });

  it("qualquer um logado vê a lista, e ela marca o mestre primeiro", async () => {
    await loginPlayer("Rita");
    const gm = await loginGm();
    const list = await api<PresenceUser[]>(server, "GET", "/api/users", { cookie: gm.cookie });
    expect(list.body.map((u) => [u.name, u.isGm, u.online])).toEqual([
      ["Mestre", true, false],
      ["Rita", false, false],
    ]);
    expect((await api(server, "GET", "/api/users")).status).toBe(401);
  });
});

describe("link do tunnel", () => {
  const fakeCloudflared = async (reply: () => { status: number; body: string }) => {
    const metrics = createServer((_req, res) => {
      const { status, body } = reply();
      res.writeHead(status, { "content-type": "application/json" }).end(body);
    });
    await new Promise<void>((resolve) => metrics.listen(0, "127.0.0.1", resolve));
    return {
      url: `http://127.0.0.1:${(metrics.address() as AddressInfo).port}/quicktunnel`,
      stop: () => new Promise<void>((resolve) => metrics.close(() => resolve())),
    };
  };

  it("só o mestre vê o link", async () => {
    const rita = await loginPlayer("Rita");
    expect((await api(server, "GET", "/api/tunnel", { cookie: rita.cookie })).status).toBe(403);
  });

  it("lê o endereço do cloudflared", async () => {
    const metrics = await fakeCloudflared(() => ({
      status: 200,
      body: JSON.stringify({ hostname: "palavras-aleatorias.trycloudflare.com" }),
    }));
    await server.stop();
    server = await startServer({ tunnelMetricsUrl: metrics.url });
    try {
      const gm = await loginGm();
      const info = await api<TunnelInfo>(server, "GET", "/api/tunnel", { cookie: gm.cookie });
      expect(info.body).toEqual({ url: "https://palavras-aleatorias.trycloudflare.com" });
    } finally {
      await metrics.stop();
    }
  });

  it("explica quando o tunnel não existe ou ainda não tem endereço", async () => {
    const gm = await loginGm();
    const none = await api<TunnelInfo>(server, "GET", "/api/tunnel", { cookie: gm.cookie });
    expect(none.body.url).toBeNull();
    expect(none.body.error).toContain("tunnel");

    const metrics = await fakeCloudflared(() => ({
      status: 200,
      body: JSON.stringify({ hostname: "" }),
    }));
    await server.stop();
    server = await startServer({ tunnelMetricsUrl: metrics.url });
    try {
      const gm2 = await loginGm();
      const starting = await api<TunnelInfo>(server, "GET", "/api/tunnel", { cookie: gm2.cookie });
      expect(starting.body.url).toBeNull();
      expect(starting.body.error).toContain("iniciando");
    } finally {
      await metrics.stop();
    }
  });
});
