// Prepara a máquina para rodar com Docker: cria data/ e escreve o .env com os segredos e o seu usuário.
// Uso: npm run setup [-- --password=SENHA] [-- --force]
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const args = process.argv.slice(2);
const force = args.includes("--force");
const passwordArg = args.find((a) => a.startsWith("--password="))?.slice("--password=".length);

fs.mkdirSync(path.join(root, "data"), { recursive: true });

/** Lê um .env simples (CHAVE=valor por linha) preservando o que já existe. */
function readEnv() {
  const values = new Map();
  if (!fs.existsSync(envPath)) return values;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (match) values.set(match[1], match[2]);
  }
  return values;
}

async function askPassword() {
  if (passwordArg) return passwordArg;
  if (!process.stdin.isTTY) return undefined;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question("Senha do mestre (Enter para gerar uma): ");
  rl.close();
  return answer.trim() || undefined;
}

const env = readEnv();
const messages = [];

if (force || !env.get("GM_PASSWORD") || env.get("GM_PASSWORD") === "troque-esta-senha") {
  const typed = await askPassword();
  const password = typed ?? crypto.randomBytes(9).toString("base64url");
  env.set("GM_PASSWORD", password);
  messages.push(typed ? "Senha do mestre salva." : `Senha do mestre gerada: ${password}`);
}
if (
  force ||
  !env.get("SESSION_SECRET") ||
  env.get("SESSION_SECRET") === "gere-um-valor-aleatorio-longo"
) {
  env.set("SESSION_SECRET", crypto.randomBytes(32).toString("hex"));
  messages.push("Segredo de sessão gerado.");
}
if (!env.has("MAX_UPLOAD_MB")) env.set("MAX_UPLOAD_MB", "15");

// Sem isso o Docker criaria arquivos em data/ como root.
if (typeof process.getuid === "function") {
  env.set("HOST_UID", String(process.getuid()));
  env.set("HOST_GID", String(process.getgid()));
}

const body = [...env].map(([key, value]) => `${key}=${value}`).join("\n") + "\n";
fs.writeFileSync(envPath, body, { mode: 0o600 });

console.log(`Pasta de dados: ${path.join(root, "data")}`);
console.log(`Arquivo ${envPath} atualizado (somente você lê).`);
for (const message of messages) console.log(message);
console.log("\nPróximo passo: docker compose up -d --build");
