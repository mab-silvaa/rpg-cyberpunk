import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface Config {
  port: number;
  dataDir: string;
  clientDir: string;
  version: string;
  /** Senha para entrar como mestre. Vazia desativa o login de mestre. */
  gmPassword: string;
  sessionSecret: string;
  /** Tamanho máximo de cada imagem enviada, em MB. */
  maxUploadMb: number;
  /** Confia no cabeçalho X-Forwarded-* (atrás do tunnel). */
  trustProxy: boolean;
  /** Endereço do /quicktunnel do cloudflared, para descobrir o link público. */
  tunnelMetricsUrl: string | undefined;
}

/** Sobe pastas até achar o package.json raiz do monorepo (o que tem "workspaces"). */
export function findRepoRoot(from = path.dirname(fileURLToPath(import.meta.url))): string {
  let dir = from;
  for (;;) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { workspaces?: unknown };
      if (pkg.workspaces) return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("Raiz do repositório não encontrada");
    dir = parent;
  }
}

/** Usa SESSION_SECRET se existir; senão gera um segredo e o guarda em dataDir para sobreviver a reinícios. */
export function resolveSessionSecret(env: NodeJS.ProcessEnv, dataDir: string): string {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  const file = path.join(dataDir, "session-secret");
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").trim();
  fs.mkdirSync(dataDir, { recursive: true });
  const secret = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const root = findRepoRoot();
  // Em desenvolvimento, lê o .env da raiz sem sobrescrever variáveis já definidas.
  const envFile = path.join(root, ".env");
  if (env === process.env && fs.existsSync(envFile)) process.loadEnvFile(envFile);

  const rootPkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as {
    version: string;
  };
  // Em desenvolvimento os dados ficam em data-dev/; o Docker define DATA_DIR=/app/data.
  const dataDir = path.resolve(env.DATA_DIR ?? path.join(root, "data-dev"));
  return {
    port: Number(env.PORT ?? 3000),
    dataDir,
    clientDir: path.join(root, "client", "dist"),
    version: rootPkg.version,
    gmPassword: env.GM_PASSWORD ?? "",
    sessionSecret: resolveSessionSecret(env, dataDir),
    maxUploadMb: Number(env.MAX_UPLOAD_MB) > 0 ? Number(env.MAX_UPLOAD_MB) : 15,
    trustProxy: env.TRUST_PROXY === "1",
    tunnelMetricsUrl: env.TUNNEL_METRICS_URL || undefined,
  };
}
