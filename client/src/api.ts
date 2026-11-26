import type {
  ApiError,
  InitiativeEntryInput,
  InitiativeView,
  Note,
  NoteInput,
  CharacterView,
  FogShapeInput,
  FogState,
  ImageInfo,
  LoginRequest,
  LoginResponse,
  PresenceUser,
  SceneInput,
  SceneSummary,
  TokenInput,
  TokenView,
  TunnelInfo,
  User,
} from "@vtt/shared";

export class ApiFailure extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method,
    headers: body === undefined || isForm ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as T & Partial<ApiError>;
  if (!res.ok) throw new ApiFailure(data.error ?? "Algo deu errado", res.status);
  return data;
}

export const api = {
  me: () => request<LoginResponse>("GET", "/api/me").then((r) => r.user),
  login: (body: LoginRequest) =>
    request<LoginResponse>("POST", "/api/login", body).then((r) => r.user),
  logout: () => request<void>("POST", "/api/logout"),
  users: () => request<PresenceUser[]>("GET", "/api/users"),
  rename: (id: number, name: string) =>
    request<PresenceUser[]>("PATCH", `/api/users/${id}`, { name }),
  kick: (id: number) => request<void>("DELETE", `/api/users/${id}`),
  tunnel: () => request<TunnelInfo>("GET", "/api/tunnel"),
  scenes: () => request<SceneSummary[]>("GET", "/api/scenes"),
  createScene: (input: SceneInput) => request<SceneSummary[]>("POST", "/api/scenes", input),
  updateScene: (id: number, input: SceneInput) =>
    request<SceneSummary[]>("PATCH", `/api/scenes/${id}`, input),
  activateScene: (id: number) => request<SceneSummary[]>("POST", `/api/scenes/${id}/activate`),
  deleteScene: (id: number) => request<SceneSummary[]>("DELETE", `/api/scenes/${id}`),
  createToken: (input: TokenInput) => request<TokenView>("POST", "/api/tokens", input),
  updateToken: (id: number, input: TokenInput) =>
    request<TokenView>("PATCH", `/api/tokens/${id}`, input),
  deleteToken: (id: number) => request<void>("DELETE", `/api/tokens/${id}`),
  fogEnabled: (sceneId: number, enabled: boolean) =>
    request<FogState>("PATCH", `/api/scenes/${sceneId}/fog`, { enabled }),
  addFogShape: (sceneId: number, shape: FogShapeInput) =>
    request<unknown>("POST", `/api/scenes/${sceneId}/fog/shapes`, shape),
  undoFog: (sceneId: number) =>
    request<FogState>("DELETE", `/api/scenes/${sceneId}/fog/shapes/last`),
  coverAllFog: (sceneId: number) =>
    request<FogState>("POST", `/api/scenes/${sceneId}/fog/cover-all`),
  revealAllFog: (sceneId: number) =>
    request<FogState>("POST", `/api/scenes/${sceneId}/fog/reveal-all`),
  createCharacter: (body: { ownerId?: number | null; data?: unknown }) =>
    request<CharacterView>("POST", "/api/characters", body),
  assignCharacter: (id: number, ownerId: number | null) =>
    request<CharacterView>("PATCH", `/api/characters/${id}`, { ownerId }),
  deleteCharacter: (id: number) => request<void>("DELETE", `/api/characters/${id}`),
  notes: () => request<Note[]>("GET", "/api/notes"),
  createNote: (input: NoteInput) => request<Note>("POST", "/api/notes", input),
  updateNote: (id: number, input: NoteInput) => request<Note>("PATCH", `/api/notes/${id}`, input),
  deleteNote: (id: number) => request<void>("DELETE", `/api/notes/${id}`),
  addInitiative: (input: InitiativeEntryInput) =>
    request<InitiativeView>("POST", "/api/initiative/entries", input),
  updateInitiative: (id: number, input: InitiativeEntryInput) =>
    request<InitiativeView>("PATCH", `/api/initiative/entries/${id}`, input),
  removeInitiative: (id: number) =>
    request<InitiativeView>("DELETE", `/api/initiative/entries/${id}`),
  initiativeFromTokens: (tokenIds: number[]) =>
    request<InitiativeView>("POST", "/api/initiative/from-tokens", { tokenIds }),
  rollInitiative: () => request<InitiativeView>("POST", "/api/initiative/roll", {}),
  startInitiative: () => request<InitiativeView>("POST", "/api/initiative/start"),
  nextInitiative: () => request<InitiativeView>("POST", "/api/initiative/next"),
  endInitiative: () => request<InitiativeView>("POST", "/api/initiative/end"),
  clearInitiative: () => request<InitiativeView>("POST", "/api/initiative/clear"),
  uploadImage: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<ImageInfo>("POST", "/api/images", form);
  },
};

export type { User };
