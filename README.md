# VTT Cyberpunk

VTT (mesa virtual) próprio para a campanha de Cyberpunk RED: mapa com tokens em tempo real, fog of war, painel do mestre, dados e fichas. Um app Node.js + TypeScript que roda no PC do mestre; os jogadores entram por link e nome.

A spec e o plano de implementação estão em documentos separados do projeto. O plano divide o trabalho em 10 fases, cada uma um pull request.

## Status

Fase 0 (fundação): monorepo, servidor com health check e WebSocket de teste, front React, SQLite com migrações e CI. O jogo em si começa na fase 1.

## Desenvolvimento no Linux

Pré-requisitos:

- Node.js 22 ou mais novo (por exemplo via `nvm`), npm e git
- Para o `npm install`: `build-essential` e `python3`, caso o `better-sqlite3` precise compilar

```bash
git clone https://github.com/mab-silvaa/rpg-cyberpunk.git
cd rpg-cyberpunk
npm install
npm start
```

`npm start` compila o pacote `shared`, sobe o servidor em <http://localhost:3000> e o Vite em <http://localhost:5173>. Abra a porta 5173 durante o desenvolvimento; ela repassa `/api` e o WebSocket ao servidor. A página deve mostrar **CONECTADO**.

Os dados de desenvolvimento ficam em `data-dev/` (fora do git). Use `DATA_DIR` para trocar a pasta e `PORT` para trocar a porta do servidor.

## Scripts

| Comando              | O que faz                                             |
| -------------------- | ----------------------------------------------------- |
| `npm start`          | Desenvolvimento com recarga automática                |
| `npm run build`      | Compila `shared`, `server` e `client`                 |
| `npm run start:prod` | Roda o servidor compilado, que também entrega o front |
| `npm test`           | Testes do servidor (Vitest)                           |
| `npm run lint`       | ESLint                                                |
| `npm run typecheck`  | Verificação de tipos nos três pacotes                 |
| `npm run format`     | Prettier (`format:check` só confere)                  |

## Estrutura

- `shared/`: tipos dos eventos e constantes usados por servidor e cliente
- `server/`: Express, Socket.IO e SQLite; migrações numeradas em `server/migrations/`
- `client/`: React + Vite

## Dados da campanha

`data/`, `data-dev/`, `backups/` e `.env` ficam no `.gitignore` e no `.dockerignore`: nada da campanha vai para o GitHub nem para dentro de imagens Docker.
