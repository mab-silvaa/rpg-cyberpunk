import type {
  ApiError,
  ImageInfo,
  LoginRequest,
  LoginResponse,
  PresenceUser,
  SceneInput,
  SceneSummary,
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
  uploadImage: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<ImageInfo>("POST", "/api/images", form);
  },
};

export type { User };
