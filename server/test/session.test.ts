import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSessionSecret } from "../src/config.js";
import {
  createSessionToken,
  FailureLimiter,
  parseCookies,
  passwordMatches,
  SESSION_MAX_AGE_MS,
  verifySessionToken,
} from "../src/session.js";

describe("token de sessão", () => {
  it("valida o que assinou e devolve o id do usuário", () => {
    const token = createSessionToken(7, "segredo", 1000);
    expect(verifySessionToken(token, "segredo", 2000)).toBe(7);
  });

  it("recusa outro segredo, token adulterado e token expirado", () => {
    const token = createSessionToken(7, "segredo", 1000);
    expect(verifySessionToken(token, "outro", 2000)).toBeNull();
    expect(verifySessionToken(token.replace(/^7\./, "8."), "segredo", 2000)).toBeNull();
    expect(verifySessionToken(token, "segredo", 1000 + SESSION_MAX_AGE_MS)).toBeNull();
    expect(verifySessionToken("lixo", "segredo")).toBeNull();
  });
});

describe("cookies e senha", () => {
  it("lê o cabeçalho Cookie", () => {
    expect(parseCookies("a=1; vtt_session=abc.def; b=x%20y")).toEqual({
      a: "1",
      vtt_session: "abc.def",
      b: "x y",
    });
    expect(parseCookies(undefined)).toEqual({});
  });

  it("compara senhas de qualquer tamanho", () => {
    expect(passwordMatches("abc", "abc")).toBe(true);
    expect(passwordMatches("abc", "abcd")).toBe(false);
    expect(passwordMatches("", "abc")).toBe(false);
  });
});

describe("limitador de falhas", () => {
  it("bloqueia depois do limite e libera quando a janela passa", () => {
    const limiter = new FailureLimiter(3, 1000);
    for (let i = 0; i < 3; i++) limiter.recordFailure("ip", 0);
    expect(limiter.isBlocked("ip", 500)).toBe(true);
    expect(limiter.isBlocked("outro-ip", 500)).toBe(false);
    expect(limiter.isBlocked("ip", 1001)).toBe(false);
  });
});

describe("segredo de sessão", () => {
  it("usa a variável de ambiente, ou gera um e reaproveita nos próximos starts", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vtt-secret-"));
    try {
      expect(resolveSessionSecret({ SESSION_SECRET: "do-env" }, dir)).toBe("do-env");
      const generated = resolveSessionSecret({}, dir);
      expect(generated).toHaveLength(64);
      expect(resolveSessionSecret({}, dir)).toBe(generated);
      expect(fs.statSync(path.join(dir, "session-secret")).mode & 0o077).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
