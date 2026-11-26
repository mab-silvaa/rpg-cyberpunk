import path from "node:path";
import { fileURLToPath } from "node:url";
import { cliDataDir, restoreBackup } from "../backup.js";
import { findRepoRoot } from "../config.js";

const args = process.argv.slice(2);
const force = args.includes("--force");
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("Uso: npm run restore -- backups/arquivo.zip [--force]");
  process.exit(1);
}
const dataDir = cliDataDir(process.env, findRepoRoot());
const migrations = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);
try {
  const result = restoreBackup(path.resolve(file), dataDir, migrations, { force });
  console.log(`Backup restaurado em ${dataDir} (${result.uploads} imagens).`);
  if (result.previous) console.log(`Os dados anteriores foram guardados em ${result.previous}`);
  console.log("Reinicie o app para usar os dados restaurados.");
} catch (err) {
  console.error(`Falha ao restaurar: ${(err as Error).message}`);
  process.exit(1);
}
