import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { unzipSync, zipSync, type Zippable } from "fflate";
import Database from "better-sqlite3";
import { runMigrations } from "./db.js";

const APP_ID = "salandra-cyberpunk";
const LAST_BACKUP_FILE = "last-backup.json";

export interface BackupManifest {
  app: string;
  createdAt: string;
  migrations: string[];
  uploads: number;
}

export interface BackupResult {
  file: string;
  uploads: number;
  bytes: number;
}

function stamp(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

/** Nome de arquivo seguro para uma entrada de uploads (sem pastas, sem pontos iniciais). */
export function isSafeUploadName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) && !name.includes("..");
}

/** Gera um .zip com uma cópia consistente do banco e a pasta uploads/. */
export async function createBackup(
  dataDir: string,
  outDir: string,
  now = new Date(),
): Promise<BackupResult> {
  const dbPath = path.join(dataDir, "vtt.db");
  if (!fs.existsSync(dbPath)) throw new Error(`Banco não encontrado em ${dbPath}`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "salandra-backup-"));
  try {
    const snapshot = path.join(tmp, "vtt.db");
    const db = new Database(dbPath, { fileMustExist: true });
    let migrations: string[];
    try {
      await db.backup(snapshot);
      migrations = (
        db.prepare("SELECT name FROM schema_migrations ORDER BY name").all() as { name: string }[]
      ).map((r) => r.name);
    } finally {
      db.close();
    }

    const files: Zippable = {};
    files["vtt.db"] = [fs.readFileSync(snapshot), { level: 6 }];
    let uploads = 0;
    const uploadsDir = path.join(dataDir, "uploads");
    if (fs.existsSync(uploadsDir)) {
      for (const entry of fs.readdirSync(uploadsDir, { withFileTypes: true })) {
        if (!entry.isFile() || !isSafeUploadName(entry.name)) continue;
        // Imagens já são comprimidas: guardar sem recomprimir.
        files[`uploads/${entry.name}`] = [
          fs.readFileSync(path.join(uploadsDir, entry.name)),
          { level: 0 },
        ];
        uploads++;
      }
    }
    const manifest: BackupManifest = {
      app: APP_ID,
      createdAt: now.toISOString(),
      migrations,
      uploads,
    };
    files["manifest.json"] = new TextEncoder().encode(JSON.stringify(manifest, null, 2));

    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, `salandra-backup-${stamp(now)}.zip`);
    const data = zipSync(files);
    fs.writeFileSync(file, data);
    fs.writeFileSync(
      path.join(dataDir, LAST_BACKUP_FILE),
      JSON.stringify({ at: now.toISOString(), file: path.basename(file) }),
    );
    return { file, uploads, bytes: data.length };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Data do último backup feito por `npm run backup`, ou null se nunca houve. */
export function lastBackupAt(dataDir: string): string | null {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dataDir, LAST_BACKUP_FILE), "utf8")) as {
      at?: unknown;
    };
    return typeof raw.at === "string" && !Number.isNaN(Date.parse(raw.at)) ? raw.at : null;
  } catch {
    return null;
  }
}

export interface RestoreResult {
  uploads: number;
  /** Onde ficaram os dados anteriores, se havia algum. */
  previous: string | null;
}

/** Restaura um backup em dataDir. Dados existentes só são substituídos com force e vão para uma pasta de segurança. */
export function restoreBackup(
  zipPath: string,
  dataDir: string,
  migrationsDir: string,
  options: { force?: boolean; now?: Date } = {},
): RestoreResult {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(fs.readFileSync(zipPath)));
  } catch (cause) {
    throw new Error("Arquivo de backup inválido ou corrompido.", { cause });
  }

  const manifestRaw = entries["manifest.json"];
  if (!manifestRaw) throw new Error("Backup sem manifest.json: não é um backup do Salandra.");
  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestRaw)) as BackupManifest;
  } catch {
    throw new Error("manifest.json ilegível.");
  }
  if (manifest.app !== APP_ID) throw new Error("Este arquivo não é um backup do Salandra.");

  const known = new Set(fs.readdirSync(migrationsDir).filter((f) => /^\d+_.+\.sql$/.test(f)));
  const unknown = (manifest.migrations ?? []).filter((m) => !known.has(m));
  if (unknown.length > 0) {
    throw new Error(
      `Backup feito por uma versão mais nova (migrações desconhecidas: ${unknown.join(", ")}). Atualize o app antes de restaurar.`,
    );
  }

  const dbBytes = entries["vtt.db"];
  if (!dbBytes) throw new Error("Backup sem vtt.db.");

  // Valida o banco numa pasta temporária antes de tocar nos dados atuais.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "salandra-restore-"));
  try {
    const tmpDb = path.join(tmp, "vtt.db");
    fs.writeFileSync(tmpDb, dbBytes);
    const check = new Database(tmpDb);
    try {
      const result = check.pragma("integrity_check", { simple: true });
      if (result !== "ok") throw new Error("O banco do backup está corrompido.");
      runMigrations(check, migrationsDir);
      check.pragma("journal_mode = DELETE");
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("O banco")) throw err;
      throw new Error("O banco do backup não pôde ser lido.", { cause: err });
    } finally {
      check.close();
    }

    const hasData = fs.existsSync(path.join(dataDir, "vtt.db"));
    if (hasData && !options.force) {
      throw new Error(
        "Já existem dados em uso. Use --force para substituí-los (eles serão guardados).",
      );
    }

    fs.mkdirSync(dataDir, { recursive: true });
    let previous: string | null = null;
    if (hasData) {
      previous = `${dataDir}.before-restore-${stamp(options.now ?? new Date())}`;
      fs.mkdirSync(previous, { recursive: true });
      for (const name of fs.readdirSync(dataDir)) {
        fs.renameSync(path.join(dataDir, name), path.join(previous, name));
      }
    }

    fs.copyFileSync(tmpDb, path.join(dataDir, "vtt.db"));
    let uploads = 0;
    const uploadsDir = path.join(dataDir, "uploads");
    fs.mkdirSync(uploadsDir, { recursive: true });
    for (const [name, bytes] of Object.entries(entries)) {
      const match = /^uploads\/([^/\\]+)$/.exec(name);
      if (!match || !isSafeUploadName(match[1]!)) continue;
      fs.writeFileSync(path.join(uploadsDir, match[1]!), bytes);
      uploads++;
    }
    // A chave de sessão não faz parte do backup; segue a que já existia.
    if (previous) {
      for (const keep of ["session-secret"]) {
        const src = path.join(previous, keep);
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dataDir, keep));
      }
    }
    return { uploads, previous };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Sem DATA_DIR, usa data/ (Docker) se já tiver banco; senão data-dev/ (desenvolvimento). */
export function cliDataDir(env: NodeJS.ProcessEnv, root: string): string {
  if (env.DATA_DIR) return path.resolve(env.DATA_DIR);
  const docker = path.join(root, "data");
  return fs.existsSync(path.join(docker, "vtt.db")) ? docker : path.join(root, "data-dev");
}
