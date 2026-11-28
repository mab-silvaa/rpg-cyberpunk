import { useState, type FormEvent } from "react";
import { NAME_MAX_LENGTH, type User } from "@vtt/shared";
import { api } from "./api";
import { Icon } from "./icons";
import { Alert, Badge, Button, Card, CheckField, TextField } from "./ui";

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
    <main className="entry-page">
      <Card tone={gm ? "gm" : undefined} className="entry-card">
        <form className="entry-body" onSubmit={(e) => void submit(e)}>
          <div className="entry-head">
            <span className="logo-mark" />
            <h1 className="logo-name">Salandra</h1>
            <span style={{ flex: 1 }} />
            {gm ? (
              <Badge tone="gm" icon="lock">
                Mestre
              </Badge>
            ) : (
              <Badge tone="accent">Jogador</Badge>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <h2 className="entry-title">Entrar na mesa</h2>
            <p className="details" style={{ fontSize: 14, lineHeight: "21px" }}>
              Cyberpunk RED, online. Só o mestre precisa de senha.
            </p>
          </div>
          <TextField
            label="Seu nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={NAME_MAX_LENGTH}
            autoFocus
            required
          />
          <CheckField
            label="Sou o mestre"
            gm
            checked={gm}
            onChange={(e) => setGm(e.target.checked)}
          />
          {gm && (
            <TextField
              label="Senha do mestre"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              error={error}
              required
            />
          )}
          {!gm && error && <Alert tone="danger">{error}</Alert>}
          <Button
            type="submit"
            variant={gm ? "gm" : "primary"}
            solid={gm}
            size="lg"
            block
            disabled={busy}
          >
            <Icon name={gm ? "lock" : "logout"} size={19} />
            {gm ? "Entrar como mestre" : "Entrar"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
