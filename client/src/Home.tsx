import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  APP_NAME,
  type ClientToServerEvents,
  type PresenceUser,
  type RulerLine,
  type RulerState,
  type SceneSummary,
  type SceneView,
  type ServerToClientEvents,
  type TokenMove,
  type TokenView,
  type User,
} from "@vtt/shared";
import { api } from "./api";
import { GmPanel } from "./GmPanel";
import { MapView } from "./MapView";

type Status = "conectando" | "conectado" | "desconectado";
type VttSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function Home({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [status, setStatus] = useState<Status>("conectando");
  const [players, setPlayers] = useState<PresenceUser[]>([]);
  const socketRef = useRef<VttSocket>(null);
  const [activeScene, setActiveScene] = useState<SceneView | null>(null);
  const [rulers, setRulers] = useState<RulerState[]>([]);
  // Mestre: tokens de todas as cenas. Jogador: só os visíveis da cena ativa.
  const [tokens, setTokens] = useState<TokenView[]>([]);
  const [selectedTokenId, setSelectedTokenId] = useState<number | null>(null);
  // Só o mestre: lista de cenas e a cena que ele está olhando em prévia.
  const [scenes, setScenes] = useState<SceneSummary[]>([]);
  const [previewId, setPreviewId] = useState<number | null>(null);

  useEffect(() => {
    const s: VttSocket = io();
    s.on("connect", () => setStatus("conectado"));
    s.on("disconnect", (reason) => {
      setStatus("desconectado");
      // O servidor fechou a conexão de propósito (por exemplo, o mestre expulsou este jogador).
      // Se a sessão não vale mais, volta para a entrada.
      if (reason === "io server disconnect") api.me().catch(onLogout);
    });
    s.on("connect_error", (error) => {
      if (error.message === "unauthorized") onLogout();
    });
    s.on("presence:update", setPlayers);
    s.on("state:snapshot", (snapshot) => {
      setActiveScene(snapshot.scene);
      setRulers(snapshot.rulers);
      setTokens(snapshot.tokens);
    });
    s.on("tokens:set", setTokens);
    s.on("token:upsert", (token) => setTokens((current) => upsertToken(current, token)));
    s.on("token:remove", (id) => setTokens((current) => current.filter((t) => t.id !== id)));
    s.on("token:move", (id, x, y) =>
      setTokens((current) => current.map((t) => (t.id === id ? { ...t, x, y } : t))),
    );
    s.on("scene:update", (scene) => {
      setActiveScene(scene);
      setRulers([]);
    });
    s.on("ruler:update", (userId, ruler) => {
      setRulers((current) => {
        const others = current.filter((r) => r.userId !== userId);
        return ruler ? [...others, ruler] : others;
      });
    });
    socketRef.current = s;
    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [onLogout]);

  useEffect(() => {
    if (user.isGm) void api.scenes().then(setScenes, () => undefined);
  }, [user.isGm]);

  const sendRuler = useCallback(
    (line: RulerLine | null) => socketRef.current?.emit("ruler:update", line),
    [],
  );

  const sendTokenMove = useCallback((move: TokenMove) => {
    socketRef.current?.emit("token:move", move);
    // Ao soltar, a posição fica valendo aqui na hora; se o servidor recusar, ele corrige.
    if (move.final) {
      setTokens((current) =>
        current.map((t) => (t.id === move.id ? { ...t, x: move.x, y: move.y } : t)),
      );
    }
  }, []);
  const changeToken = useCallback(
    (token: TokenView) => setTokens((current) => upsertToken(current, token)),
    [],
  );
  const removeToken = useCallback(
    (id: number) => setTokens((current) => current.filter((t) => t.id !== id)),
    [],
  );

  const preview = useMemo(
    () => (previewId === null ? undefined : scenes.find((s) => s.id === previewId)),
    [previewId, scenes],
  );
  const shown = preview ?? activeScene;
  const shownTokens = useMemo(
    () => (shown ? tokens.filter((t) => t.sceneId === shown.id) : []),
    [tokens, shown],
  );

  async function leave() {
    await api.logout();
    onLogout();
  }

  return (
    <main className="home">
      <header>
        <h1>{APP_NAME}</h1>
        <div className="who">
          <span className={`status status-${status}`} role="status">
            {status}
          </span>
          <span>
            {user.name}
            {user.isGm ? " (mestre)" : ""}
          </span>
          <button className="link" onClick={() => void leave()}>
            Sair
          </button>
        </div>
      </header>

      <MapView
        scene={shown}
        preview={preview !== undefined && preview.id !== activeScene?.id}
        // Na prévia as réguas da cena ativa não fazem sentido, e a régua do mestre não deve vazar.
        rulers={preview && preview.id !== activeScene?.id ? [] : rulers}
        isGm={user.isGm}
        selfId={user.id}
        tokens={shownTokens}
        selectedTokenId={selectedTokenId}
        onSelectToken={user.isGm ? setSelectedTokenId : noSelect}
        onMoveToken={sendTokenMove}
        onRuler={preview && preview.id !== activeScene?.id ? noRuler : sendRuler}
        onLeavePreview={() => setPreviewId(null)}
      />

      <section className="card">
        <h2>Na mesa</h2>
        <ul className="players">
          {players.map((p) => (
            <li key={p.id} className={p.online ? "online" : "offline"}>
              {p.name}
              {p.isGm ? " (mestre)" : ""}
            </li>
          ))}
        </ul>
      </section>

      {user.isGm && (
        <GmPanel
          self={user}
          players={players}
          scenes={scenes}
          onScenes={setScenes}
          previewId={previewId}
          onPreview={setPreviewId}
          shownScene={shown}
          tokens={shownTokens}
          selectedTokenId={selectedTokenId}
          onSelectToken={setSelectedTokenId}
          onTokenChange={changeToken}
          onTokenRemove={removeToken}
        />
      )}
    </main>
  );
}

const noRuler = (): void => undefined;
const noSelect = (): void => undefined;

function upsertToken(list: TokenView[], token: TokenView): TokenView[] {
  return list.some((t) => t.id === token.id)
    ? list.map((t) => (t.id === token.id ? token : t))
    : [...list, token];
}
