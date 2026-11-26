/** Eventos que o cliente envia ao servidor. */
export interface ClientToServerEvents {
  "echo:ping": (message: string, ack: (reply: EchoReply) => void) => void;
}

/** Eventos que o servidor envia ao cliente. */
export interface ServerToClientEvents {
  "server:hello": (info: ServerHello) => void;
}

export interface EchoReply {
  message: string;
  receivedAt: number;
}

export interface ServerHello {
  version: string;
}

export interface HealthResponse {
  status: "ok";
  version: string;
}

export const APP_NAME = "VTT Cyberpunk";
