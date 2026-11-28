-- Token hostil: anel vermelho no mapa para o mestre marcar inimigos.
ALTER TABLE tokens ADD COLUMN hostile INTEGER NOT NULL DEFAULT 0;
