import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClientToServerEvents, HealthResponse, ServerToClientEvents } from "@vtt/shared";
import { createApp, type AppContext } from "../src/app.js";
import { openDatabase } from "../src/db.js";

let dataDir: string;
let ctx: AppContext;
let baseUrl: string;
let client: Socket<ServerToClientEvents, ClientToServerEvents> | undefined;

beforeEach(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vtt-app-"));
  const db = openDatabase(dataDir);
  ctx = createApp(
    { port: 0, dataDir, clientDir: path.join(dataDir, "sem-client"), version: "9.9.9" },
    db,
  );
  await new Promise<void>((resolve) => ctx.httpServer.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(ctx.httpServer.address() as AddressInfo).port}`;
});

afterEach(async () => {
  client?.disconnect();
  await ctx.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("servidor", () => {
  it("responde o health check com a versão", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as HealthResponse;
    expect(body).toEqual({ status: "ok", version: "9.9.9" });
  });

  it("entrega o front compilado e cai no index.html em rotas desconhecidas", async () => {
    const clientDir = path.join(dataDir, "client");
    fs.mkdirSync(clientDir);
    fs.writeFileSync(path.join(clientDir, "index.html"), "<h1>front</h1>");
    const db = openDatabase(path.join(dataDir, "db2"));
    const other = createApp({ port: 0, dataDir, clientDir, version: "1" }, db);
    await new Promise<void>((resolve) => other.httpServer.listen(0, resolve));
    const url = `http://127.0.0.1:${(other.httpServer.address() as AddressInfo).port}`;
    try {
      expect(await (await fetch(url)).text()).toContain("front");
      expect(await (await fetch(`${url}/qualquer/rota`)).text()).toContain("front");
    } finally {
      await other.close();
      db.close();
    }
  });

  it("cumprimenta o cliente por WebSocket e responde o eco", async () => {
    client = connect(baseUrl, { transports: ["websocket"] });
    const hello = await new Promise((resolve) => client!.once("server:hello", resolve));
    expect(hello).toEqual({ version: "9.9.9" });

    const reply = await client.emitWithAck("echo:ping", "olá");
    expect(reply.message).toBe("olá");
    expect(reply.receivedAt).toBeGreaterThan(0);
  });
});
