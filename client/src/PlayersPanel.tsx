import { useState } from "react";
import { NAME_MAX_LENGTH, type PresenceUser, type User } from "@vtt/shared";
import { api } from "./api";
import { Icon } from "./icons";
import { Badge, ErrorText, IconButton, MoreMenu, Panel, useConfirm } from "./ui";

/** Renomear dentro da linha (mestre): Enter salva, Esc cancela. */
function InlineRename({ player, onDone }: { player: PresenceUser; onDone: () => void }) {
  const [value, setValue] = useState(player.name);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function save() {
    const name = value.trim();
    if (!name) return setError("O nome não pode ficar vazio.");
    if (name === player.name) return onDone();
    setSaving(true);
    try {
      await api.rename(player.id, name);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo deu errado");
      setSaving(false);
    }
  }

  return (
    <div className="inline-rename">
      <div className={`field ${error ? "error" : ""}`} style={{ flex: 1, minWidth: 0 }}>
        <span className="control">
          <input
            autoFocus
            aria-label={`Novo nome para ${player.name}`}
            value={value}
            maxLength={NAME_MAX_LENGTH}
            disabled={saving}
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              setValue(e.target.value);
              setError(undefined);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              if (e.key === "Escape") onDone();
            }}
          />
        </span>
        {error && (
          <span className="field-msg" role="alert">
            <Icon name="alert" size={14} />
            {error}
          </span>
        )}
      </div>
      <IconButton
        icon={saving ? "refresh" : "check"}
        label="Salvar nome"
        size="sm"
        variant="primary"
        disabled={saving}
        onClick={() => void save()}
      />
      <IconButton
        icon="x"
        label="Cancelar"
        size="sm"
        variant="ghost"
        disabled={saving}
        onClick={onDone}
      />
    </div>
  );
}

/** Quem está na mesa. O mestre também renomeia e expulsa. */
export function PlayersPanel({ self, players }: { self: User; players: PresenceUser[] }) {
  const confirm = useConfirm();
  const [error, setError] = useState<string>();
  const [editingId, setEditingId] = useState<number | null>(null);

  async function run(action: () => Promise<unknown>) {
    setError(undefined);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo deu errado");
    }
  }

  async function kick(player: PresenceUser) {
    const ok = await confirm({
      title: `Expulsar ${player.name}?`,
      message: `${player.name} sai da mesa agora e perde a conexão. A ficha continua salva.`,
      confirmLabel: "Expulsar",
      danger: true,
    });
    if (ok) void run(() => api.kick(player.id));
  }

  return (
    <Panel title="Na mesa" gm={self.isGm} count={players.length}>
      <ul className="list players">
        {players.map((p) => (
          <li key={p.id} className={`row ${p.online ? "online" : "offline"}`}>
            <span className={`dot ${p.online ? "" : "off"}`} aria-hidden="true" />
            {editingId === p.id ? (
              <InlineRename player={p} onDone={() => setEditingId(null)} />
            ) : (
              <span className="row-name">
                {p.name}
                {p.isGm && (
                  <Badge tone="gm" icon="lock">
                    Mestre
                  </Badge>
                )}
                <span className="sr-only">{p.online ? "online" : "offline"}</span>
              </span>
            )}
            {self.isGm && p.id !== self.id && editingId !== p.id && (
              <MoreMenu
                label={`Mais ações de ${p.name}`}
                items={[
                  { label: "Renomear", icon: "note", onSelect: () => setEditingId(p.id) },
                  { label: "Expulsar", icon: "x", danger: true, onSelect: () => void kick(p) },
                ]}
              />
            )}
          </li>
        ))}
      </ul>
      {self.isGm && players.length <= 1 && <p className="details">Ninguém mais entrou ainda.</p>}
      <ErrorText>{error}</ErrorText>
    </Panel>
  );
}
