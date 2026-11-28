-- Notas privadas do mestre (Markdown).
CREATE TABLE notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Iniciativa: uma lista de entradas e o estado do combate (rodada e quem está na vez).
CREATE TABLE initiative_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  value REAL,
  token_id INTEGER REFERENCES tokens(id) ON DELETE SET NULL,
  hidden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE combat (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  round INTEGER NOT NULL DEFAULT 0,
  active_entry_id INTEGER REFERENCES initiative_entries(id) ON DELETE SET NULL
);
INSERT INTO combat (id, round, active_entry_id) VALUES (1, 0, NULL);
