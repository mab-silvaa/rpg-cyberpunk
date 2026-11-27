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

## Pedidos pendentes para o Design

O que o código precisou resolver sem ter uma peça no sistema (ver a descrição do PR para o detalhe):

1. Token hostil (anel vermelho): o app não tem o dado de "hostil" no token; falta definir como o mestre marca.
2. Campo para trocar nome (hoje `window.prompt` ao renomear jogador).
3. Painel do jogador no PC (abas Dados, Ficha, Mesa) e histórico de rolagens no PC.
4. Aba de fichas e de histórico de rolagens no painel do mestre (hoje dentro da aba Mesa).
5. Ficha em duas colunas (resumo fixo + abas) para telas grandes; hoje a ficha cabe no painel lateral.
6. Escolha de arquivo (imagem de mapa e de token) com o visual do sistema.
7. Zoom no celular (pinça ou botões).
