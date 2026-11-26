import crypto from "node:crypto";
import { SESSION_DAYS } from "@vtt/shared";

export const SESSION_COOKIE = "vtt_session";
export const SESSION_MAX_AGE_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Token no formato `idDoUsuario.expiraEm.assinatura`. */
export function createSessionToken(userId: number, secret: string, now = Date.now()): string {
  const payload = `${userId}.${now + SESSION_MAX_AGE_MS}`;
  return `${payload}.${sign(payload, secret)}`;
}

/** Devolve o id do usuário se o token for válido e não tiver expirado; senão null. */
export function verifySessionToken(token: string, secret: string, now = Date.now()): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresAt, signature] = parts as [string, string, string];
  const expected = Buffer.from(sign(`${userId}.${expiresAt}`, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  if (!Number.isFinite(Number(expiresAt)) || Number(expiresAt) <= now) return null;
  const id = Number(userId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (key && !(key in cookies)) cookies[key] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

/** Compara senhas sem vazar o tamanho nem o ponto da diferença. */
export function passwordMatches(given: string, expected: string): boolean {
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/** Bloqueia um IP depois de `max` falhas dentro da janela. Só falhas contam. */
export class FailureLimiter {
  private failures = new Map<string, number[]>();

  constructor(
    private max = 5,
    private windowMs = 60_000,
  ) {}

  private recent(key: string, now: number): number[] {
    const list = (this.failures.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length > 0) this.failures.set(key, list);
    else this.failures.delete(key);
    return list;
  }

  isBlocked(key: string, now = Date.now()): boolean {
    return this.recent(key, now).length >= this.max;
  }

  recordFailure(key: string, now = Date.now()): void {
    this.failures.set(key, [...this.recent(key, now), now]);
  }
}
