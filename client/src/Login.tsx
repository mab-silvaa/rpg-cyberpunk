import { useState, type FormEvent } from "react";
import { APP_NAME, NAME_MAX_LENGTH, type User } from "@vtt/shared";
import { api } from "./api";

export function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [name, setName] = useState("");
  const [gm, setGm] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      onLogin(await api.login({ name, gm, password: gm ? password : undefined }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo deu errado");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <h1>{APP_NAME}</h1>
      <form className="card" onSubmit={(e) => void submit(e)}>
        <label>
          Seu nome
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={NAME_MAX_LENGTH}
            autoFocus
            required
          />
        </label>
        <label className="check">
          <input type="checkbox" checked={gm} onChange={(e) => setGm(e.target.checked)} />
          Sou o mestre
        </label>
        {gm && (
          <label>
            Senha do mestre
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy}>
          Entrar
        </button>
      </form>
    </main>
  );
}
