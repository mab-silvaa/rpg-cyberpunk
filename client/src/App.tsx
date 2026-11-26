import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { APP_NAME } from "@vtt/shared";
import type { ClientToServerEvents, ServerToClientEvents } from "@vtt/shared";

type Status = "conectando" | "conectado" | "desconectado";

export function App() {
  const [status, setStatus] = useState<Status>("conectando");
  const [version, setVersion] = useState<string>();
  const [latency, setLatency] = useState<number>();

  useEffect(() => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io();
    socket.on("connect", () => setStatus("conectado"));
    socket.on("disconnect", () => setStatus("desconectado"));
    socket.on("server:hello", (info) => setVersion(info.version));

    const timer = setInterval(() => {
      const sentAt = Date.now();
      void socket
        .timeout(2000)
        .emitWithAck("echo:ping", "ping")
        .then(
          () => setLatency(Date.now() - sentAt),
          () => setLatency(undefined),
        );
    }, 2000);

    return () => {
      clearInterval(timer);
      socket.disconnect();
    };
  }, []);

  return (
    <main className="shell">
      <h1>{APP_NAME}</h1>
      <p className={`status status-${status}`} role="status">
        {status}
      </p>
      <p className="details">
        {version ? `servidor v${version}` : "aguardando o servidor"}
        {latency !== undefined ? ` · ${latency} ms` : ""}
      </p>
    </main>
  );
}
