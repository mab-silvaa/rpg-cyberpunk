import type {
  ApiError,
  LoginRequest,
  LoginResponse,
  PresenceUser,
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
  const res = await fetch(url, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
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
};

export type { User };
