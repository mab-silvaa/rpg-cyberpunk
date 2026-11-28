// Teste ponta a ponta: sobe o servidor compilado e usa dois navegadores reais (mestre e jogador).
// Uso: npm run build && npm run e2e   (CHROMIUM_PATH aponta para um Chrome/Chromium, se necessário)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { chromium } from "playwright";
import { io } from "socket.io-client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = process.env.E2E_PORT ?? "3199";
const BASE = `http://127.0.0.1:${PORT}`;
const shots = process.env.E2E_SHOTS;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "salandra-e2e-"));

let step = 0;
const log = (msg) => console.log(`${String(++step).padStart(2, "0")}. ${msg}`);
function check(cond, msg) {
  if (!cond) throw new Error(`Falhou: ${msg}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** PNG sólido, sem arquivo de imagem no repositório. */
function makePng(width, height) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 90)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const server = spawn("node", ["server/dist/index.js"], {
  cwd: root,
  env: { ...process.env, PORT, DATA_DIR: dataDir, GM_PASSWORD: "e2e-pw", SESSION_SECRET: "e2e" },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

async function waitHealth() {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {
      /* ainda subindo */
    }
    await sleep(250);
  }
  throw new Error("Servidor não respondeu ao health check");
}

/** Cliente de socket usando a sessão (cookie) de um contexto do navegador. */
async function socketFor(context) {
  const cookie = (await context.cookies(BASE)).map((c) => `${c.name}=${c.value}`).join("; ");
  const socket = io(BASE, { extraHeaders: { cookie }, transports: ["websocket"] });
  const events = [];
  socket.onAny((name, ...args) => events.push({ name, args }));
  const snapshot = new Promise((resolve) => socket.once("state:snapshot", resolve));
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  return { socket, events, snapshot: await snapshot };
}

async function login(page, name, gmPassword) {
  await page.goto(BASE);
  await page.getByLabel("Seu nome").fill(name);
  if (gmPassword) {
    await page.getByLabel("Sou o mestre").check();
    await page.getByLabel("Senha do mestre").fill(gmPassword);
  }
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("status").filter({ hasText: "conectado" }).waitFor();
}

async function api(page, method, url, data) {
  const res = await page.request.fetch(`${BASE}${url}`, { method, data });
  check(res.ok(), `${method} ${url} respondeu ${res.status()}: ${await res.text()}`);
  return res.json();
}

let browser;
try {
  await waitHealth();
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const gmCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const playerCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const gm = await gmCtx.newPage();
  const player = await playerCtx.newPage();
  const errors = [];
  for (const page of [gm, player]) page.on("pageerror", (e) => errors.push(e.message));

  log("Mestre e jogador entram pela tela de login");
  await login(gm, "Mestre", "e2e-pw");
  await login(player, "Ana");
  const users = await api(gm, "GET", "/api/users");
  const ana = users.find((u) => u.name === "Ana");
  check(ana, "jogador Ana aparece na lista");
  await gm.getByRole("tab", { name: "Mesa" }).click();
  await gm.locator("ul.players li.online", { hasText: "Ana" }).first().waitFor();

  log("Mestre sem backup vê o aviso de backup");
  await gm.getByRole("tab", { name: "Cena" }).click();
  await gm.getByText("ainda não fez nenhum backup").waitFor();

  log("Mestre cria cena com mapa enviado e a ativa");
  const upload = await gm.request.post(`${BASE}/api/images`, {
    multipart: { file: { name: "mapa.png", mimeType: "image/png", buffer: makePng(800, 600) } },
  });
  check(upload.status() === 201, `upload respondeu ${upload.status()}`);
  const image = await upload.json();
  const scenes = await api(gm, "POST", "/api/scenes", { name: "Teste", imageId: image.id });
  const scene = scenes.at(-1);
  await api(gm, "POST", `/api/scenes/${scene.id}/activate`);

  log("Mestre cria um token do jogador e um token de inimigo");
  const rex = await api(gm, "POST", "/api/tokens", {
    sceneId: scene.id,
    name: "Rex",
    x: 100,
    y: 100,
    ownerId: ana.id,
  });
  const boss = await api(gm, "POST", "/api/tokens", {
    sceneId: scene.id,
    name: "Chefe",
    x: 400,
    y: 300,
  });

  const g = await socketFor(gmCtx);
  const p = await socketFor(playerCtx);
  check(
    p.snapshot.tokens
      .map((t) => t.name)
      .sort()
      .join() === "Chefe,Rex",
    "jogador vê os dois tokens no início",
  );

  log("Jogador move o próprio token e o mestre recebe; mover o do inimigo é recusado");
  p.socket.emit("token:move", { id: rex.id, x: 250, y: 150, final: true });
  p.socket.emit("token:move", { id: boss.id, x: 10, y: 10, final: true });
  await sleep(600);
  const moved = g.events.find((e) => e.name === "token:move" && e.args[0] === rex.id);
  check(moved && moved.args[1] === 250 && moved.args[2] === 150, "mestre recebeu o movimento");
  check(
    !g.events.some((e) => e.name === "token:move" && e.args[0] === boss.id),
    "inimigo ficou parado",
  );
  const again = await socketFor(playerCtx);
  const rexNow = again.snapshot.tokens.find((t) => t.id === rex.id);
  check(rexNow.x === 250 && rexNow.y === 150, "posição ficou salva no servidor");
  again.socket.close();

  log("Mestre liga o fog e cobre tudo: jogador perde o inimigo, mas mantém o próprio token");
  await api(gm, "PATCH", `/api/scenes/${scene.id}/fog`, { enabled: true });
  await api(gm, "POST", `/api/scenes/${scene.id}/fog/cover-all`);
  await sleep(500);
  const hidden = await socketFor(playerCtx);
  check(
    hidden.snapshot.tokens.map((t) => t.name).join() === "Rex",
    `sob fog o jogador só vê o próprio token (viu: ${hidden.snapshot.tokens.map((t) => t.name)})`,
  );
  hidden.socket.close();

  log("Mestre revela tudo e o inimigo volta para o jogador");
  await api(gm, "POST", `/api/scenes/${scene.id}/fog/reveal-all`);
  await sleep(500);
  const shown = await socketFor(playerCtx);
  check(shown.snapshot.tokens.length === 2, "inimigo voltou a aparecer");
  shown.socket.close();

  log("Jogador rola 2d6+3 pela tela e o mestre vê o resultado");
  await player.getByLabel("Expressão de dados").fill("2d6+3");
  await player.getByRole("button", { name: "Rolar", exact: true }).click();
  await gm.getByRole("tab", { name: "Histórico" }).click();
  await gm.getByLabel("Histórico de rolagens").getByText("Ana").first().waitFor();
  await player.getByRole("tab", { name: "Histórico" }).click();
  await player.getByLabel("Histórico de rolagens").getByText("Ana").first().waitFor();

  log("Rolagem secreta do mestre não aparece para o jogador");
  await gm.getByLabel("Expressão de dados").fill("1d20");
  await gm.getByRole("button", { name: /Rolar em segredo/ }).click();
  await gm.locator(".roll.secret").first().waitFor();
  await sleep(400);
  check((await player.locator(".roll.secret").count()) === 0, "jogador não viu rolagem secreta");

  log("Jogador cria a ficha, edita o handle e o mestre vê a ficha");
  await player.getByRole("tab", { name: "Ficha" }).click();
  await player.getByRole("button", { name: "Criar ficha" }).click();
  await player.getByRole("button", { name: "Abrir ficha" }).click();
  await player.getByLabel("Handle").fill("Zeta");
  await player.getByText(/salvo/i).first().waitFor();
  await gm.getByRole("tab", { name: "Fichas" }).click();
  await gm.getByRole("button", { name: "Zeta", exact: true }).waitFor();

  log("Painel do mestre: nota privada nunca chega ao jogador");
  const note = await gm.request.post(`${BASE}/api/notes`, {
    data: { title: "Segredo", body: "# Plano\nO chefe é traidor" },
  });
  check(note.ok(), `criar nota respondeu ${note.status()}`);
  const playerNotes = await player.request.get(`${BASE}/api/notes`);
  check(
    playerNotes.status() === 403,
    `jogador deveria receber 403 nas notas (recebeu ${playerNotes.status()})`,
  );

  log("Celular: tela estreita fica em modo só-ver (sem Régua)");
  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const phone = await phoneCtx.newPage();
  await login(phone, "Bia");
  check((await phone.getByRole("button", { name: "Régua" }).count()) === 0, "celular sem régua");
  check((await player.getByRole("button", { name: "Régua" }).count()) === 1, "desktop com régua");
  await phoneCtx.close();

  log("Backup: o servidor passa a informar a data do último backup");
  await new Promise((resolve, reject) => {
    const bk = spawn("node", ["server/dist/cli/backup.js"], {
      cwd: root,
      env: {
        ...process.env,
        DATA_DIR: dataDir,
        BACKUP_DIR: path.join(dataDir, "..", "e2e-backups"),
      },
      stdio: "ignore",
    });
    bk.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("backup falhou"))));
  });
  const status = await api(gm, "GET", "/api/backup-status");
  check(status.lastBackupAt, "servidor passou a informar o último backup");

  check(errors.length === 0, `erros de JavaScript no navegador: ${errors.join(" | ")}`);
  if (shots) {
    fs.mkdirSync(shots, { recursive: true });
    await gm.screenshot({ path: path.join(shots, "e2e-mestre.png"), fullPage: true });
    await player.screenshot({ path: path.join(shots, "e2e-jogador.png"), fullPage: true });
  }
  g.socket.close();
  p.socket.close();
  console.log(`\nOK: ${step} etapas passaram.`);
} catch (error) {
  console.error(`\nERRO na etapa ${step}: ${error.message}`);
  console.error(serverLog.split("\n").slice(-15).join("\n"));
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.rmSync(path.join(dataDir, "..", "e2e-backups"), { recursive: true, force: true });
  // Sockets abertos pelo teste não deixam o Node sair sozinho.
  process.exit(process.exitCode ?? 0);
}
