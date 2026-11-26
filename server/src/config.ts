import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface Config {
  port: number;
  dataDir: string;
  clientDir: string;
  version: string;
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const root = findRepoRoot();
  const rootPkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as {
    version: string;
  };
  return {
    port: Number(env.PORT ?? 3000),
    // Em desenvolvimento os dados ficam em data-dev/; o Docker define DATA_DIR=/app/data.
    dataDir: path.resolve(env.DATA_DIR ?? path.join(root, "data-dev")),
    clientDir: path.join(root, "client", "dist"),
    version: rootPkg.version,
  };
}
