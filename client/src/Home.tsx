import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  APP_NAME,
  type ClientToServerEvents,
  type PresenceUser,
  type ServerToClientEvents,
  type User,
} from "@vtt/shared";
import { api } from "./api";
import { GmPanel } from "./GmPanel";

type Status = "conectando" | "conectado" | "desconectado";

export function Home({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [status, setStatus] = useState<Status>("conectando");
  const [players, setPlayers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io();
    socket.on("connect", () => setStatus("conectado"));
    socket.on("disconnect", (reason) => {
      setStatus("desconectado");
      // O servidor fechou a conexão de propósito (por exemplo, o mestre expulsou este jogador).
      // Se a sessão não vale mais, volta para a entrada.
      if (reason === "io server disconnect") api.me().catch(onLogout);
    });
    socket.on("connect_error", (error) => {
      if (error.message === "unauthorized") onLogout();
    });
    socket.on("presence:update", setPlayers);
    return () => {
      socket.disconnect();
    };
  }, [onLogout]);

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
        <p className="details">O mapa e as fichas chegam nas próximas fases.</p>
      </section>

      {user.isGm && <GmPanel self={user} players={players} />}
    </main>
  );
}
