import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { createApp, type AppContext } from "../src/app.js";
import type { Config } from "../src/config.js";
import { openDatabase } from "../src/db.js";

export interface TestServer {
  url: string;
  ctx: AppContext;
  dataDir: string;
  stop: () => Promise<void>;
}

export async function startServer(overrides: Partial<Config> = {}): Promise<TestServer> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vtt-test-"));
  const db = openDatabase(path.join(dataDir, "data"));
  const config: Config = {
    port: 0,
    dataDir,
    clientDir: path.join(dataDir, "sem-client"),
    version: "9.9.9",
    gmPassword: "senha-do-mestre",
    sessionSecret: "segredo-de-teste",
    maxUploadMb: 15,
    trustProxy: false,
    tunnelMetricsUrl: undefined,
    ...overrides,
  };
  const ctx = createApp(config, db);
  await new Promise<void>((resolve) => ctx.httpServer.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(ctx.httpServer.address() as AddressInfo).port}`;
  return {
    url,
    ctx,
    dataDir,
    stop: async () => {
      await ctx.close();
      db.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

export interface Reply<T = unknown> {
  status: number;
  body: T;
  /** Cookie de sessão devolvido pelo servidor, no formato `nome=valor`. */
  cookie: string | undefined;
}

export async function api<T = unknown>(
  server: TestServer,
  method: string,
  route: string,
  options: {
    body?: unknown;
    form?: FormData;
    cookie?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<Reply<T>> {
  const res = await fetch(`${server.url}${route}`, {
    method,
    headers: {
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...options.headers,
    },
    body: options.form ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
  });
  const text = await res.text();
  const setCookie = res.headers.getSetCookie()[0];
  return {
    status: res.status,
    body: (text ? JSON.parse(text) : undefined) as T,
    cookie: setCookie?.split(";")[0],
  };
}

/** PNG 1×1 válido. */
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** Só o cabeçalho de um PNG com o tamanho pedido: basta para testar limites sem gerar pixels. */
export function pngHeader(width: number, height: number): Buffer {
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write("IHDR", 12, "ascii");
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  header[24] = 8;
  header[25] = 6;
  return header;
}

export function uploadForm(
  content: Buffer | string,
  filename = "mapa.png",
  type = "image/png",
): FormData {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(typeof content === "string" ? Buffer.from(content) : content)], {
      type,
    }),
    filename,
  );
  return form;
}
