import fs from "node:fs";
import path from "node:path";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  ClientToServerEvents,
  HealthResponse,
  PresenceUser,
  ServerToClientEvents,
} from "@vtt/shared";
import { api, startServer, type TestServer } from "./helpers.js";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let server: TestServer;
const clients: Client[] = [];

const open = (cookie?: string): Client => {
  const client: Client = connect(server.url, {
    transports: ["websocket"],
    extraHeaders: cookie ? { cookie } : {},
    reconnection: false,
  });
  clients.push(client);
  return client;
};

beforeEach(async () => {
  server = await startServer();
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect();
  await server.stop();
});

describe("servidor", () => {
  it("responde o health check com a versão", async () => {
    const res = await api<HealthResponse>(server, "GET", "/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", version: "9.9.9" });
  });

  it("entrega o front compilado e cai no index.html em rotas desconhecidas", async () => {
    await server.stop();
    const clientDir = path.join(process.env.TMPDIR ?? "/tmp", `vtt-front-${Date.now()}`);
    fs.mkdirSync(clientDir);
    fs.writeFileSync(path.join(clientDir, "index.html"), "<h1>front</h1>");
    server = await startServer({ clientDir });
    try {
      expect(await (await fetch(server.url)).text()).toContain("front");
      expect(await (await fetch(`${server.url}/qualquer/rota`)).text()).toContain("front");
    } finally {
      fs.rmSync(clientDir, { recursive: true, force: true });
    }
  });
});

describe("WebSocket", () => {
  it("recusa conexão sem sessão", async () => {
    const client = open();
    const error = await new Promise<Error>((resolve) => client.once("connect_error", resolve));
    expect(error.message).toBe("unauthorized");
  });

  it("cumprimenta quem tem sessão e responde o eco", async () => {
    const { cookie } = await api(server, "POST", "/api/login", { body: { name: "Rita" } });
    const client = open(cookie);
    const hello = await new Promise<{ version: string; user: { name: string } }>((resolve) =>
      client.once("server:hello", resolve),
    );
    expect(hello.version).toBe("9.9.9");
    expect(hello.user.name).toBe("Rita");

    const reply = await client.emitWithAck("echo:ping", "olá");
    expect(reply.message).toBe("olá");
  });

  it("avisa a todos quando alguém entra e sai", async () => {
    const rita = await api(server, "POST", "/api/login", { body: { name: "Rita" } });
    const bruno = await api(server, "POST", "/api/login", { body: { name: "Bruno" } });

    const ritaClient = open(rita.cookie);
    const onlineNames = (list: PresenceUser[]): string[] =>
      list.filter((u) => u.online).map((u) => u.name);
    await new Promise((resolve) => ritaClient.once("presence:update", resolve));

    const sawBruno = new Promise<PresenceUser[]>((resolve) => {
      ritaClient.on("presence:update", (list) => {
        if (onlineNames(list).includes("Bruno")) resolve(list);
      });
    });
    const brunoClient = open(bruno.cookie);
    expect(onlineNames(await sawBruno)).toEqual(["Rita", "Bruno"]);

    const sawLeave = new Promise<PresenceUser[]>((resolve) => {
      ritaClient.on("presence:update", (list) => {
        if (!onlineNames(list).includes("Bruno")) resolve(list);
      });
    });
    brunoClient.disconnect();
    expect(onlineNames(await sawLeave)).toEqual(["Rita"]);
  });

  it("desconecta quem o mestre expulsa", async () => {
    const gm = await api(server, "POST", "/api/login", {
      body: { name: "Mestre", gm: true, password: "senha-do-mestre" },
    });
    const rita = await api<{ user: { id: number } }>(server, "POST", "/api/login", {
      body: { name: "Rita" },
    });
    const ritaClient = open(rita.cookie);
    await new Promise((resolve) => ritaClient.once("server:hello", resolve));

    const closed = new Promise<string>((resolve) => ritaClient.once("disconnect", resolve));
    const res = await api(server, "DELETE", `/api/users/${rita.body.user.id}`, {
      cookie: gm.cookie,
    });
    expect(res.status).toBe(204);
    expect(await closed).toBe("io server disconnect");
  });
});
