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

## Peças entregues pelo Design (pranchas 08 a 14)

Aplicadas no código: token hostil (`TokenShape.tsx`, campo `hostile` no servidor), diálogo e menu para mudar o nome (`Rename.tsx`, linha editável em `PlayersPanel.tsx`), painéis Ficha/Histórico e abas Fichas/Histórico do mestre (`PlayerPanel.tsx`, `GmPanel.tsx`, `Summary.tsx`), ficha em folha única (`CharacterSheet.tsx`), envio de imagem com progresso (`FileDrop.tsx`) e zoom no celular (`MapView.tsx`).

## Pendências e diferenças a resolver com o Design

1. **Armas:** a folha tem só Arma, Dano e Munição. Mantivemos uma coluna "Skill" (usada no botão de ataque), e ROF e notas de armas, implantes e itens ficam guardados mas sem campo na folha.
2. **Derrotado:** o design não define de onde vem. Hoje é derivado de HP em zero, só para token hostil com ficha ligada.
3. **Nome:** o design diz 2 a 24 caracteres; o servidor aceita 1 a 32 e o texto do diálogo mostra o limite real.
4. **Filtros** (Todas/Minhas, Todas/Secretas, Todas/Jogadores/NPCs): usamos o botão pequeno do sistema; falta o desenho de um grupo de filtros.
5. **Painel do jogador no PC:** o design mostra só Ficha e Histórico. A lista "Na mesa" e os botões de teste/dano saíram do PC (continuam no celular, aba Mesa, e as rolagens seguem pela barra de dados).
6. **Cartão rápido do token no celular** (toque no token): ainda não feito; precisa de definição do que mostrar para um token oculto ou sem ficha.
7. **Erro do histórico** ("Tentar de novo"): o histórico vem do socket, sem chamada que falhe, então só o vazio e o carregando existem.
8. **Controles de zoom à esquerda** (canhotos) é só sugestão no design; não implementado.
