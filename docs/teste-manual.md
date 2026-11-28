# Roteiro de teste manual (antes de uma sessão com os amigos)

Leva uns 15 minutos. Faça com 1 ou 2 amigos de verdade, no Discord, usando o link do tunnel.

## Antes

1. `npm run setup` e depois `docker compose up -d --build`.
2. Abra `http://localhost:3000`, entre como mestre e copie o link do painel do mestre.
3. Rode `npm run backup` e confira que o aviso de backup some do painel.

## Com os amigos

1. Os jogadores abrem o link, digitam o nome e entram. Eles aparecem em "Na mesa".
2. Mestre: envie um mapa, crie a cena, ative. Os jogadores veem o mapa na hora.
3. Mestre: crie um token para cada jogador (dono = o jogador). Cada um arrasta o próprio token; o do outro não mexe.
4. Mestre: ligue o fog, cubra tudo, revele uma área com o pincel. Pergunte se o inimigo escondido sumiu para os jogadores.
5. Régua: um jogador mede; todos veem a linha.
6. Dados: um jogador rola `1d10!`, o mestre faz uma rolagem secreta (ninguém mais pode ver).
7. Cada jogador cria a ficha, preenche e recarrega a página: tudo continua lá.
8. Iniciativa: o mestre monta a ordem; os jogadores só veem a ordem, sem os escondidos.
9. Celular: um jogador entra pelo celular. Deve conseguir ver tudo, rolar dados e ler a ficha, mas não arrastar tokens.
10. Derrube a internet de um jogador por alguns segundos: aparece "Conexão perdida" e o mapa volta ao normal sozinho.

## Depois

- `docker compose restart` e confirme que o novo link do tunnel aparece no painel (o antigo para de funcionar).
- Teste o `npm run restore -- backups/ARQUIVO.zip --force` em uma máquina de teste antes de precisar dele de verdade.

## O que anotar

Qualquer coisa que travou, ficou lenta ao arrastar (principalmente pelo tunnel) ou confusa. Isso alimenta o redesenho de interface planejado.
