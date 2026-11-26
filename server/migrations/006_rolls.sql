-- Histórico de rolagens. O resultado completo fica em JSON; o nome é copiado para o histórico
-- continuar legível se o jogador for renomeado ou expulso.
CREATE TABLE rolls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  user_name TEXT NOT NULL,
  expression TEXT NOT NULL,
  label TEXT,
  secret INTEGER NOT NULL DEFAULT 0,
  outcome TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
