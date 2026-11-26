import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db.js";

const config = loadConfig();
const db = openDatabase(config.dataDir);
const { httpServer, close } = createApp(config, db);
if (!config.gmPassword) {
  console.warn("GM_PASSWORD não definida: o login de mestre está desativado. Rode npm run setup.");
}

httpServer.listen(config.port, () => {
  console.log(`VTT ouvindo em http://localhost:${config.port} (dados em ${config.dataDir})`);
});

function shutdown(): void {
  void close().then(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
