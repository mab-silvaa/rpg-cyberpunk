import type { FogShape, FogState } from "./fog.js";
import type { CharacterData, CharacterView } from "./character.js";
import type { InitiativeView } from "./initiative.js";
import type { RollReply, RollRequest, RollResult } from "./dice.js";
import type { TokenMove, TokenView } from "./tokens.js";

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

export interface BackupStatus {
  /** Quando foi feito o último backup (ISO), ou null se nunca. */
  lastBackupAt: string | null;
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

/** A cena como os jogadores a enxergam. Coordenadas do mapa são em pixels da imagem. */
export interface SceneView {
  id: number;
  name: string;
  imageUrl: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  gridPx: number;
  metersPerSquare: number;
  gridVisible: boolean;
}

/** A cena na lista do mestre. */
export interface SceneSummary extends SceneView {
  imageId: number | null;
  isActive: boolean;
}

/** Campos que o mestre pode mudar numa cena. */
export interface SceneInput {
  name?: string;
  imageId?: number | null;
  gridPx?: number;
  metersPerSquare?: number;
  gridVisible?: boolean;
}

export interface ImageInfo {
  id: number;
  url: string;
  width: number;
  height: number;
}

/** Régua arrastada no mapa, em pixels da imagem. */
export interface RulerLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface RulerState extends RulerLine {
  userId: number;
  name: string;
}

export interface StateSnapshot {
  scene: SceneView | null;
  rulers: RulerState[];
  /** Mestre: tokens de todas as cenas. Jogador: só os visíveis da cena ativa. */
  tokens: TokenView[];
  /** Mestre: fog de todas as cenas. Jogador: só a da cena ativa. */
  fogs: FogState[];
  /** Histórico recente de rolagens; as secretas só vêm para o mestre. */
  rolls: RollResult[];
  /** Mestre: todas as fichas. Jogador: as próprias. */
  characters: CharacterView[];
  initiative: InitiativeView;
}

/** Eventos que o cliente envia ao servidor. */
export interface ClientToServerEvents {
  "echo:ping": (message: string, ack: (reply: EchoReply) => void) => void;
  /** null quando o jogador solta a régua. */
  "ruler:update": (line: RulerLine | null) => void;
  /** Arrasto de token. O servidor confere dono e papel; se recusar, devolve o token como está. */
  "token:move": (move: TokenMove) => void;
  /** Rola dados no servidor; a resposta traz o resultado ou o erro. */
  "dice:roll": (request: RollRequest, ack: (reply: RollReply) => void) => void;
  /** Salva campos da ficha (autosave). O dono ou o mestre; a resposta traz a ficha como ficou. */
  "character:patch": (
    id: number,
    patch: Partial<CharacterData>,
    ack: (reply: CharacterReply) => void,
  ) => void;
}

/** Eventos que o servidor envia ao cliente. */
export interface ServerToClientEvents {
  "server:hello": (info: ServerHello) => void;
  "presence:update": (users: PresenceUser[]) => void;
  /** Estado da mesa, enviado ao conectar. */
  "state:snapshot": (snapshot: StateSnapshot) => void;
  /** A cena ativa mudou (ou ficou sem cena, com null). */
  "scene:update": (scene: SceneView | null) => void;
  /** Régua de outro jogador; null quando ele a solta. */
  "ruler:update": (userId: number, ruler: RulerState | null) => void;
  /** Token novo ou alterado. */
  "token:upsert": (token: TokenView) => void;
  "token:remove": (id: number) => void;
  /** Outro usuário está arrastando (ou soltou) um token. */
  "token:move": (id: number, x: number, y: number) => void;
  /** Troca a lista inteira de tokens (cena mudou, por exemplo). */
  "tokens:set": (tokens: TokenView[]) => void;
  /** Fog inteira de uma cena (ligar, desligar, desfazer, cobrir ou revelar tudo, trocar de cena). */
  "fog:set": (fog: FogState) => void;
  /** Uma forma nova de fog. */
  "fog:add": (sceneId: number, shape: FogShape) => void;
  /** Rolagem nova (as secretas só chegam ao mestre). */
  "dice:result": (roll: RollResult) => void;
  /** Ficha nova ou alterada (só para o mestre e o dono). */
  "character:update": (character: CharacterView) => void;
  "character:remove": (id: number) => void;
  /** Iniciativa inteira (o mestre recebe os valores e as entradas ocultas; jogadores, só a ordem). */
  "initiative:set": (initiative: InitiativeView) => void;
}

export type CharacterReply = { ok: true; character: CharacterView } | { ok: false; error: string };

export interface SocketData {
  user: User;
}

export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 24;
export const SESSION_DAYS = 30;

export const GRID_PX_MIN = 10;
export const GRID_PX_MAX = 500;
export const SCENE_NAME_MAX_LENGTH = 60;
/** Lado máximo de uma imagem de mapa; acima disso muitos navegadores não desenham. */
export const MAX_IMAGE_SIDE = 8192;
export * from "./measure.js";
export * from "./tokens.js";
export * from "./fog.js";
export * from "./dice.js";
export * from "./character.js";
export * from "./initiative.js";
export * from "./notes.js";
export * from "./markdown.js";
