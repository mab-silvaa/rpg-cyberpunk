-- Imagens enviadas pelo mestre. O arquivo fica em uploads/ com o nome gerado pelo servidor.
CREATE TABLE images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cenas (mapas). No máximo uma cena fica ativa, e é a que os jogadores veem.
CREATE TABLE scenes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  image_id INTEGER REFERENCES images(id) ON DELETE SET NULL,
  grid_px INTEGER NOT NULL DEFAULT 70,
  meters_per_square REAL NOT NULL DEFAULT 2,
  grid_visible INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX scenes_one_active ON scenes (is_active) WHERE is_active = 1;
