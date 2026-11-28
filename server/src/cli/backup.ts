import path from "node:path";
import { cliDataDir, createBackup } from "../backup.js";
import { findRepoRoot } from "../config.js";

const dataDir = cliDataDir(process.env, findRepoRoot());
const outDir = process.env.BACKUP_DIR ?? path.join(findRepoRoot(), "backups");
try {
  const result = await createBackup(dataDir, outDir);
  console.log(`Backup criado: ${result.file}`);
  console.log(`(${result.uploads} imagens, ${(result.bytes / 1024 / 1024).toFixed(1)} MB)`);
  console.log("Guarde uma cópia fora deste computador (nuvem ou pen drive).");
} catch (err) {
  console.error(`Falha no backup: ${(err as Error).message}`);
  process.exit(1);
}
