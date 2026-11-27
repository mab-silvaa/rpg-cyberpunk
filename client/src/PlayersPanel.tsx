import { useState } from "react";
import type { PresenceUser, User } from "@vtt/shared";
import { api } from "./api";
import { Badge, ErrorText, MoreMenu, Panel, useConfirm } from "./ui";

/** Quem está na mesa. O mestre também renomeia e expulsa. */
export function PlayersPanel({ self, players }: { self: User; players: PresenceUser[] }) {
  const confirm = useConfirm();
  const [error, setError] = useState<string>();

  async function run(action: () => Promise<unknown>) {
    setError(undefined);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo deu errado");
    }
  }

  function rename(player: PresenceUser) {
    const name = window.prompt(`Novo nome para ${player.name}`, player.name);
    if (name && name !== player.name) void run(() => api.rename(player.id, name));
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
            <span className="row-name">
              {p.name}
              {p.isGm && (
                <Badge tone="gm" icon="lock">
                  Mestre
                </Badge>
              )}
              <span className="sr-only">{p.online ? "online" : "offline"}</span>
            </span>
            {self.isGm && p.id !== self.id && (
              <MoreMenu
                label={`Mais ações de ${p.name}`}
                items={[
                  { label: "Renomear", icon: "note", onSelect: () => rename(p) },
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
