# Sistema de design (Salandra · Neon Grid)

A interface segue o sistema de design feito no Claude Design:
https://claude.ai/artifact/5Vqt3uRxN7CXzJEvQAWbbe

**Regra:** não inventar estilos, componentes nem variações fora dele. Se faltar uma peça, um estado ou uma tela, pedir ao Claude Design e só depois implementar.

## Onde está cada parte

- `client/src/styles.css`: tokens (cores, fontes, espaço) e as classes de cada componente.
- `client/src/ui.tsx`: botão, botão de ícone, selo, campo, número com − e +, faixa de aviso, cartão, painel recolhível, abas, menu "mais", diálogo de confirmação e aviso rápido.
- `client/src/icons.tsx`: os ícones do sistema (traço de 1,75 px, grade de 24).
- Fontes: arquivos locais via `@fontsource` (Chakra Petch, IBM Plex Sans, JetBrains Mono), sem internet durante o jogo.
- Mapa (Konva): constantes da prancha 03 em `MapView.tsx`, `TokenShape.tsx` e `FogLayer.tsx`.

## Peças entregues pelo Design (pranchas 08 a 18)

Aplicadas no código:

- **Token hostil** (prancha 08): `TokenShape.tsx`, campo `hostile` no servidor.
- **Mudar o nome** (09): `Rename.tsx` e linha editável em `PlayersPanel.tsx`. O nome tem 2 a 24 caracteres (`NAME_MIN_LENGTH` e `NAME_MAX_LENGTH` em `shared`), no servidor e nos campos.
- **Painéis do jogador e do mestre** (10 e 11): `PlayerPanel.tsx`, `GmPanel.tsx`, `Summary.tsx`.
- **Ficha em folha única** (12): `CharacterSheet.tsx`.
- **Envio de arquivo** (13): `FileDrop.tsx`.
- **Zoom no celular** (14): `MapView.tsx`.
- **Cartão rápido do token no celular** (15): `TokenCard.tsx`, aberto ao tocar num token no celular do jogador. O dono vê HP e SP e abre a ficha; outro jogador vê só o estado em palavras (Em pé, Ferido, Caído); hostil mostra "Hostil" sem números; derrotado e token sem ficha só informam. O estado em palavras vem do servidor (`condition` em `TokenView`), então o jogador não precisa receber o HP de NPCs. Token oculto nunca chega ao jogador.
- **Estado Derrotado** (16): campo `defeated` no token (migração 010). Hostil com HP zero cai sozinho, NPC aliado só pela marca do mestre ("Marcar derrotado" no menu do token), jogador nunca. No mapa o token apaga, fica abaixo dos vivos e não arrasta (`TokenShape.tsx`, `MapView.tsx`). Na iniciativa a entrada desce para "Derrotados" e a vez a pula (`Initiative.next` no servidor, `InitiativePanel.tsx`). Na lista de tokens do mestre a linha apaga e ganha "Reviver" (`TokensPanel.tsx`); reviver um hostil que caiu por HP zero devolve 1 de HP à ficha. Na lista de fichas a vida em zero fica vermelha.
- **Filtros em grupo** (17): `SegmentedFilter` em `ui.tsx`, usado no histórico (ciano para o jogador, magenta para o mestre) e na lista de fichas. Setas movem o foco.
- **Armas na ficha** (18): colunas Arma, Skill (lista das skills da ficha), Dano, ROF, Munição e Notas, na coluna da direita abaixo das skills; no celular cada arma vira um cartão. Se a skill da arma sai da ficha, a arma fica em erro até escolher outra.

## O que ainda falta ou difere do design

1. **Controles de zoom à esquerda** (canhotos): é só sugestão no design e não foi implementado.
2. **Cartão do token na visão do mestre** (criar ficha, vincular, ocultar, mostrar aos jogadores): o mestre não usa o layout de celular, então só a visão do jogador foi ligada. Se o mestre também for usar o celular, falta decidir onde o cartão aparece.
3. **Arrastar o cartão para baixo** para fechar: fecha pelo ✕, por Esc ou tocando no mapa, mas o gesto de arrastar não existe.
4. **Reviver** também aparece só na lista de tokens e no menu do token; na iniciativa do mestre não há botão de reviver.
5. **Notas de implantes e itens** continuam guardadas na ficha sem campo; o design (prancha 18) só cobre as armas.
6. **Erro e carregando dos filtros** ("Não foi possível filtrar", grupo desativado): os filtros são feitos na própria tela, sem chamada que falhe, então só os estados normal, ativo, foco e vazio existem.
7. **Painel do jogador no PC:** o design mostra só Ficha e Histórico. A lista "Na mesa" e os botões de teste/dano saíram do PC (continuam no celular, aba Mesa; as rolagens seguem pela barra de dados).
8. **Erro do histórico** ("Tentar de novo"): o histórico vem do socket, sem chamada que falhe.
9. **Nomes antigos:** quem já tinha nome com 1 caractere ou mais de 24 não consegue entrar de novo com ele; é só escolher um novo.
