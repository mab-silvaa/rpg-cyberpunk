# Etapa 1: instala dependências, compila tudo e remove o que só serve para desenvolver.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
# O better-sqlite3 já traz binários prontos (inclusive para Alpine), então não precisa compilar.
# --ignore-scripts evita que o npm tente rodar o node-gyp, que exigiria Python e g++.
RUN npm ci --ignore-scripts
COPY shared shared
COPY server server
COPY client client
RUN npm run build && npm prune --omit=dev

# Etapa 2: só o necessário para rodar.
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/shared/package.json shared/package.json
COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/server/package.json server/package.json
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/migrations server/migrations
COPY --from=build /app/client/dist client/dist
# O compose troca o usuário pelo seu (HOST_UID/HOST_GID) para os arquivos em data/ ficarem com você.
RUN mkdir -p /app/data /app/backups && chown node:node /app/data /app/backups
USER node
ENV PORT=3000 DATA_DIR=/app/data
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server/dist/index.js"]
