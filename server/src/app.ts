import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import express from "express";
import { Server } from "socket.io";
import type Database from "better-sqlite3";
import type { ClientToServerEvents, HealthResponse, ServerToClientEvents } from "@vtt/shared";
import type { Config } from "./config.js";

export type VttServer = Server<ClientToServerEvents, ServerToClientEvents>;

export interface AppContext {
  httpServer: http.Server;
  io: VttServer;
  close: () => Promise<void>;
}

export function createApp(config: Config, db: Database.Database): AppContext {
  const app = express();

  app.get("/api/health", (_req, res) => {
    db.prepare("SELECT 1").get();
    const body: HealthResponse = { status: "ok", version: config.version };
    res.json(body);
  });

  // Em produção o servidor entrega o front compilado; em desenvolvimento o Vite cuida disso.
  if (fs.existsSync(config.clientDir)) {
    app.use(express.static(config.clientDir));
    app.get("/{*splat}", (_req, res) => res.sendFile(path.join(config.clientDir, "index.html")));
  }

  const httpServer = http.createServer(app);
  const io: VttServer = new Server(httpServer);

  io.on("connection", (socket) => {
    socket.emit("server:hello", { version: config.version });
    socket.on("echo:ping", (message, ack) => {
      ack({ message, receivedAt: Date.now() });
    });
  });

  return {
    httpServer,
    io,
    close: async () => {
      await io.close();
      if (httpServer.listening) {
        await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      }
    },
  };
}
