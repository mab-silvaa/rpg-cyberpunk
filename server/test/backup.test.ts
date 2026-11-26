import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cliDataDir, createBackup, lastBackupAt, restoreBackup } from "../src/backup.js";
import { openDatabase } from "../src/db.js";

const migrations = path.resolve(import.meta.dirname, "..", "migrations");
let tmp: string;
let dataDir: string;
let outDir: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bk-test-"));
  dataDir = path.join(tmp, "data");
  outDir = path.join(tmp, "backups");
  const db = openDatabase(dataDir);
  db.prepare("INSERT INTO users (name, name_key) VALUES ('Ana', 'ana')").run();
  db.close();
  fs.mkdirSync(path.join(dataDir, "uploads"), { recursive: true });
  fs.writeFileSync(path.join(dataDir, "uploads", "mapa.png"), "PNGDATA");
});

afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("backup e restore", () => {
  it("faz backup, registra a data e restaura em outra pasta", async () => {
    expect(lastBackupAt(dataDir)).toBeNull();
    const result = await createBackup(dataDir, outDir, new Date("2026-11-26T10:00:00"));
    expect(result.uploads).toBe(1);
    expect(path.basename(result.file)).toMatch(/^salandra-backup-2026-11-26-100000\.zip$/);
    expect(lastBackupAt(dataDir)).not.toBeNull();

    const target = path.join(tmp, "novo");
    const restored = restoreBackup(result.file, target, migrations);
    expect(restored.uploads).toBe(1);
    expect(restored.previous).toBeNull();
    expect(fs.readFileSync(path.join(target, "uploads", "mapa.png"), "utf8")).toBe("PNGDATA");
    const db = openDatabase(target);
    expect(db.prepare("SELECT name FROM users").all()).toEqual([{ name: "Ana" }]);
    db.close();
  });

  it("exige --force para substituir dados e guarda os antigos", async () => {
    const { file } = await createBackup(dataDir, outDir);
    expect(() => restoreBackup(file, dataDir, migrations)).toThrow(/--force/);
    const result = restoreBackup(file, dataDir, migrations, { force: true });
    expect(result.previous).toMatch(/before-restore/);
    expect(fs.existsSync(path.join(result.previous!, "vtt.db"))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, "vtt.db"))).toBe(true);
  });

  it("recusa arquivo corrompido e zip alheio", () => {
    const bad = path.join(tmp, "ruim.zip");
    fs.writeFileSync(bad, "isto não é um zip");
    expect(() => restoreBackup(bad, path.join(tmp, "x"), migrations)).toThrow(/inválido/);
    const other = path.join(tmp, "outro.zip");
    fs.writeFileSync(other, zipSync({ "a.txt": new TextEncoder().encode("oi") }));
    expect(() => restoreBackup(other, path.join(tmp, "x"), migrations)).toThrow(/manifest/);
  });

  it("recusa banco corrompido sem tocar nos dados atuais", async () => {
    const manifest = JSON.stringify({ app: "salandra-cyberpunk", migrations: [], uploads: 0 });
    const zip = path.join(tmp, "db-ruim.zip");
    fs.writeFileSync(
      zip,
      zipSync({
        "manifest.json": new TextEncoder().encode(manifest),
        "vtt.db": new TextEncoder().encode("não é sqlite ".repeat(100)),
      }),
    );
    expect(() => restoreBackup(zip, dataDir, migrations, { force: true })).toThrow();
    expect(fs.existsSync(path.join(dataDir, "uploads", "mapa.png"))).toBe(true);
  });

  it("recusa backup de versão mais nova", async () => {
    const zip = path.join(tmp, "futuro.zip");
    fs.writeFileSync(
      zip,
      zipSync({
        "manifest.json": new TextEncoder().encode(
          JSON.stringify({ app: "salandra-cyberpunk", migrations: ["999_futuro.sql"] }),
        ),
        "vtt.db": new Uint8Array(1),
      }),
    );
    expect(() => restoreBackup(zip, path.join(tmp, "y"), migrations)).toThrow(/mais nova/);
  });

  it("ignora entradas com caminho perigoso", async () => {
    const { file } = await createBackup(dataDir, outDir);
    const { unzipSync } = await import("fflate");
    const entries = unzipSync(new Uint8Array(fs.readFileSync(file)));
    const evil = zipSync({
      ...entries,
      "uploads/../../escapou.txt": new TextEncoder().encode("x"),
      "uploads/sub/dir.png": new TextEncoder().encode("x"),
      "../fora.txt": new TextEncoder().encode("x"),
    });
    const zip = path.join(tmp, "evil.zip");
    fs.writeFileSync(zip, evil);
    const target = path.join(tmp, "alvo");
    const result = restoreBackup(zip, target, migrations);
    expect(result.uploads).toBe(1);
    expect(fs.existsSync(path.join(tmp, "escapou.txt"))).toBe(false);
    expect(fs.existsSync(path.join(tmp, "fora.txt"))).toBe(false);
    expect(fs.readdirSync(path.join(target, "uploads"))).toEqual(["mapa.png"]);
  });

  it("escolhe data/ quando já há banco do Docker", () => {
    const root = path.join(tmp, "repo");
    fs.mkdirSync(path.join(root, "data"), { recursive: true });
    expect(cliDataDir({}, root)).toBe(path.join(root, "data-dev"));
    fs.writeFileSync(path.join(root, "data", "vtt.db"), "");
    expect(cliDataDir({}, root)).toBe(path.join(root, "data"));
    expect(cliDataDir({ DATA_DIR: "/x" }, root)).toBe("/x");
  });
});
