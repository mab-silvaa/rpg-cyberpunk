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
    });
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

  const preview = useMemo(
    () => (previewId === null ? undefined : scenes.find((s) => s.id === previewId)),
    [previewId, scenes],
  );
  const shown = preview ?? activeScene;

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
        />
      )}
    </main>
  );
}

const noRuler = (): void => undefined;
