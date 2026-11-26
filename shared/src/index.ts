export const APP_NAME = "Salandra Cyberpunk";

export interface User {
  id: number;
  name: string;
  isGm: boolean;
}

/** Usuário da lista de presença: quem está conectado agora aparece com online = true. */
export interface PresenceUser extends User {
  online: boolean;
}

export interface LoginRequest {
  name: string;
  /** true para entrar como mestre; exige a senha. */
  gm?: boolean;
  password?: string;
}

export interface LoginResponse {
  user: User;
}

export interface ApiError {
  error: string;
}

export interface TunnelInfo {
  /** Link público atual do tunnel, ou null se ainda não existe. */
  url: string | null;
  error?: string;
}

export interface HealthResponse {
  status: "ok";
  version: string;
}

export interface EchoReply {
  message: string;
  receivedAt: number;
}

export interface ServerHello {
  version: string;
  user: User;
}

/** Eventos que o cliente envia ao servidor. */
export interface ClientToServerEvents {
  "echo:ping": (message: string, ack: (reply: EchoReply) => void) => void;
}

/** Eventos que o servidor envia ao cliente. */
export interface ServerToClientEvents {
  "server:hello": (info: ServerHello) => void;
  "presence:update": (users: PresenceUser[]) => void;
}

export interface SocketData {
  user: User;
}

export const NAME_MAX_LENGTH = 32;
export const SESSION_DAYS = 30;
