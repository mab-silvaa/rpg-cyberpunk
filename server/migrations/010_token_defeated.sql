-- Token derrotado: marcação manual do mestre (NPC aliado). Hostil com HP em zero cai sozinho,
-- e jogador nunca fica derrotado; essas duas regras são calculadas, não gravadas.
ALTER TABLE tokens ADD COLUMN defeated INTEGER NOT NULL DEFAULT 0;
