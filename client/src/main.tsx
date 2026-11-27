import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Fontes do sistema de design, como arquivos locais (nada de internet durante o jogo).
import "@fontsource/chakra-petch/latin-500.css";
import "@fontsource/chakra-petch/latin-600.css";
import "@fontsource/chakra-petch/latin-700.css";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-600.css";
import { App } from "./App";
import "./styles.css";

// O mapa desenha texto num canvas: espera as fontes antes do primeiro quadro para não cair na fonte reserva.
const canvasFonts = [
  '700 12px "Chakra Petch"',
  '600 11px "JetBrains Mono"',
  '600 12px "JetBrains Mono"',
];
void Promise.allSettled(canvasFonts.map((f) => document.fonts.load(f))).then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
