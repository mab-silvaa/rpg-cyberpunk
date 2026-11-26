-- Fog of war: ligada por cena, com uma lista ordenada de formas (retângulos e traços de pincel).
ALTER TABLE scenes ADD COLUMN fog_enabled INTEGER NOT NULL DEFAULT 0;

CREATE TABLE fog_shapes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scene_id INTEGER NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('reveal', 'cover')),
  shape TEXT NOT NULL
);

CREATE INDEX fog_shapes_scene ON fog_shapes (scene_id, id);
