-- Tokens ficam numa cena. x e y são o centro, em pixels da imagem; size é o lado em quadrados.
CREATE TABLE tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scene_id INTEGER NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  size REAL NOT NULL DEFAULT 1,
  color TEXT NOT NULL DEFAULT '#f5e90a',
  image_id INTEGER REFERENCES images(id) ON DELETE SET NULL,
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX tokens_scene ON tokens (scene_id);
