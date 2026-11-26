# Salandra Cyberpunk

VTT (mesa virtual) próprio para a campanha de Cyberpunk RED: mapa com tokens em tempo real, fog of war, painel do mestre, dados e fichas. Um app Node.js + TypeScript que roda no PC do mestre; os jogadores entram por link e nome.

A spec e o plano de implementação estão em documentos separados do projeto. O plano divide o trabalho em 10 fases, cada uma um pull request.

## Status

- Fase 0: monorepo, servidor com health check, front React, SQLite com migrações e CI
- Fase 1: entrada por nome, senha do mestre, painel do mestre (link do tunnel, renomear e expulsar jogadores) e Docker com Cloudflare quick tunnel

- Fase 2: cenas com imagem de fundo enviada pelo mestre, grid configurável, zoom, pan, régua (os outros veem a régua em tempo real) e prévia de cenas no painel do mestre

- Fase 3: tokens (nome, tamanho, cor, imagem opcional, dono, oculto) que o mestre cria no painel; quem é dono move o próprio token, com encaixe no grid (segure Shift para soltar livre) e os outros veem em tempo real

- Fase 4: fog of war por cena (guardada como lista de formas: retângulo e pincel, revelar ou cobrir, com desfazer, cobrir tudo e revelar tudo). O servidor não envia aos jogadores os tokens que estão sob fog

- Fase 5: dados no servidor (`crypto.randomInt`) com histórico guardado. Escreva rolagens como `2d6+3` ou `1d10!+8` (o `!` pede o teste do RED: 10 natural soma outro d10, 1 natural subtrai outro d10); dano em d6 marca crítico com dois ou mais 6. O mestre pode rolar em segredo

- Fase 6: ficha do Cyberpunk RED (STATs, skills, vitais, armadura, armas, cyberware, equipamento, lifepath) com autosave. HP máximo, Humanity máxima e Death Save são calculados; clicar numa skill ou arma rola o teste. Token ligado a uma ficha mostra a barra de HP (jogadores só veem o HP de fichas de personagem, nunca o de NPC)

- Fase 7: painel do mestre com notas privadas em Markdown (autosave), NPCs (fichas sem jogador, com atalho para colocar no mapa e duplicar) e iniciativa (tokens da cena, rolagem 1d10 + REF para NPCs, ordem, rodada e vez; os jogadores veem só a ordem)

Backup e teste ponta a ponta chegam nas próximas fases. O app não traz mapas, imagens nem conteúdo de campanha: tudo que aparece na mesa é o que o mestre envia.

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

## Jogar com Docker (jogadores entram pelo link)

Pré-requisitos: Docker Engine com o plugin `docker compose` e seu usuário no grupo `docker` (`sudo usermod -aG docker $USER`, depois saia e entre na sessão).

```bash
npm run setup            # cria data/ e o .env (pergunta a senha do mestre; Enter gera uma)
docker compose up -d --build
```

1. Abra <http://localhost:3000>, marque "Sou o mestre" e entre com a senha.
2. No painel do mestre, clique em **Copiar link** e cole no Discord. Os jogadores abrem o link, digitam o nome e entram.
3. Para parar: `docker compose down`. Os dados continuam em `data/`.

O tunnel usado é o **quick tunnel** da Cloudflare: não precisa de conta nem de domínio, mas o link muda toda vez que o container do tunnel reinicia (e com `docker compose down` e `up`). Cole o link novo no Discord a cada sessão. Se o painel não mostrar o link, `docker compose logs tunnel` também o imprime.

O container roda com o seu usuário (`HOST_UID` e `HOST_GID` no `.env`, preenchidos pelo `npm run setup`), então os arquivos em `data/` ficam seus. Se o `npm run setup` não foi rodado, o Docker cria `data/` como root e o app não consegue gravar.

## Variáveis de ambiente

| Variável             | Para quê                                                                  |
| -------------------- | ------------------------------------------------------------------------- |
| `GM_PASSWORD`        | Senha para entrar como mestre. Sem ela, o login de mestre fica desativado |
| `SESSION_SECRET`     | Assina os cookies de sessão. Se faltar, o app gera um e guarda em `data/` |
| `DATA_DIR`           | Pasta do banco e dos uploads (`data-dev/` em desenvolvimento)             |
| `MAX_UPLOAD_MB`      | Tamanho máximo de cada imagem enviada (15). Lado máximo: 8192 px          |
| `PORT`               | Porta do servidor (3000)                                                  |
| `TRUST_PROXY`        | `1` atrás do tunnel, para enxergar o IP real; o compose já define         |
| `TUNNEL_METRICS_URL` | Onde ler o link do quick tunnel; o compose já define                      |

Em desenvolvimento (`npm start`), o servidor também lê o `.env` da raiz. Sem `GM_PASSWORD` você entra como jogador, mas não como mestre.

## Scripts

| Comando                          | O que faz                                                 |
| -------------------------------- | --------------------------------------------------------- |
| `npm start`                      | Desenvolvimento com recarga automática                    |
| `npm run build`                  | Compila `shared`, `server` e `client`                     |
| `npm run start:prod`             | Roda o servidor compilado, que também entrega o front     |
| `npm test`                       | Testes do servidor (Vitest)                               |
| `npm run setup`                  | Cria `data/` e o `.env` para rodar com Docker             |
| `npm run backup`                 | Gera `backups/salandra-backup-DATA.zip` (banco + imagens) |
| `npm run restore -- arquivo.zip` | Restaura um backup (`--force` se já houver dados)         |
| `npm run lint`                   | ESLint                                                    |
| `npm run typecheck`              | Verificação de tipos nos três pacotes                     |
| `npm run format`                 | Prettier (`format:check` só confere)                      |

## Estrutura

- `shared/`: tipos dos eventos e constantes usados por servidor e cliente
- `server/`: Express, Socket.IO e SQLite; migrações numeradas em `server/migrations/`
- `client/`: React + Vite

## Backup e restauração

Faça `npm run backup` antes de cada sessão importante e guarde uma cópia fora do computador. O painel do mestre avisa quando passa de 7 dias sem backup. Com Docker, rode no terminal da pasta do projeto: `docker compose exec app node server/dist/cli/backup.js` (o zip aparece em `backups/`).

Para restaurar: pare o app (`docker compose down`), rode `npm run restore -- backups/ARQUIVO.zip --force` e suba de novo. Os dados anteriores nunca são apagados: ficam em `data.before-restore-DATA/`.

## Dados da campanha

`data/`, `data-dev/`, `backups/` e `.env` ficam no `.gitignore` e no `.dockerignore`: nada da campanha vai para o GitHub nem para dentro de imagens Docker.
