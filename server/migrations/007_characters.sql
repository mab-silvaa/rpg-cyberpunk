-- Fichas de personagem. O conteúdo da ficha fica em JSON (validado antes de gravar).
CREATE TABLE characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX characters_owner ON characters (owner_id);

-- Token ligado a uma ficha mostra a barra de HP dela.
ALTER TABLE tokens ADD COLUMN character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL;
