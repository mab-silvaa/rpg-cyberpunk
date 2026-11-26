-- Primeira migração: guarda metadados do app. As tabelas do jogo entram nas próximas fases.
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO meta (key, value) VALUES ('created_at', datetime('now'));
