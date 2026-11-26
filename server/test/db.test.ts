import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase, runMigrations } from "../src/db.js";
import Database from "better-sqlite3";

const tmpDirs: string[] = [];
function tmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vtt-test-"));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("migrações", () => {
  it("cria o banco e aplica a migração inicial", () => {
    const db = openDatabase(path.join(tmp(), "data"));
    const meta = db.prepare("SELECT value FROM meta WHERE key = 'created_at'").get();
    expect(meta).toBeDefined();
    db.close();
  });

  it("não reaplica migrações já feitas", () => {
    const dir = tmp();
    const migrations = path.join(dir, "migrations");
    fs.mkdirSync(migrations);
    fs.writeFileSync(path.join(migrations, "001_a.sql"), "CREATE TABLE a (id INTEGER);");
    const db = new Database(":memory:");
    expect(runMigrations(db, migrations)).toEqual(["001_a.sql"]);
    expect(runMigrations(db, migrations)).toEqual([]);

    fs.writeFileSync(path.join(migrations, "002_b.sql"), "CREATE TABLE b (id INTEGER);");
    expect(runMigrations(db, migrations)).toEqual(["002_b.sql"]);
    db.close();
  });

  it("desfaz a migração inteira se o SQL falhar", () => {
    const dir = tmp();
    fs.writeFileSync(
      path.join(dir, "001_ruim.sql"),
      "CREATE TABLE c (id INTEGER); INSERT INTO nao_existe VALUES (1);",
    );
    const db = new Database(":memory:");
    expect(() => runMigrations(db, dir)).toThrow();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE name = 'c'").all();
    expect(tables).toHaveLength(0);
    db.close();
  });
});
