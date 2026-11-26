import { useEffect, useState } from "react";
import type {
  CharacterView,
  FogState,
  InitiativeView,
  PresenceUser,
  SceneSummary,
  SceneView,
  TokenView,
  BackupStatus,
  TunnelInfo,
  User,
} from "@vtt/shared";
import { api } from "./api";
import { FogPanel } from "./FogPanel";
import { InitiativeControls } from "./InitiativePanel";
import { NotesPanel } from "./NotesPanel";
import { NpcPanel } from "./NpcPanel";
import { ScenesPanel } from "./ScenesPanel";
import { TokensPanel } from "./TokensPanel";

interface Props {
  self: User;
  players: PresenceUser[];
  scenes: SceneSummary[];
  onScenes: (scenes: SceneSummary[]) => void;
  previewId: number | null;
  onPreview: (id: number | null) => void;
  shownScene: SceneView | null;
  tokens: TokenView[];
  fog: FogState | null;
  characters: CharacterView[];
  onCharacterCreated: (character: CharacterView) => void;
  initiative: InitiativeView;
  selectedTokenId: number | null;
  onSelectToken: (id: number | null) => void;
  onTokenChange: (token: TokenView) => void;
  onTokenRemove: (id: number) => void;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const isBackupStale = (at: string | null): boolean => !at || Date.now() - Date.parse(at) > WEEK_MS;

export function GmPanel({
  self,
  players,
  scenes,
  onScenes,
  previewId,
  onPreview,
  shownScene,
  tokens,
  fog,
  characters,
  onCharacterCreated,
  initiative,
  selectedTokenId,
  onSelectToken,
  onTokenChange,
  onTokenRemove,
}: Props) {
  const [tunnel, setTunnel] = useState<TunnelInfo>();
  const [backup, setBackup] = useState<BackupStatus>();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void api
      .tunnel()
      .then(setTunnel, () => setTunnel({ url: null, error: "Falha ao ler o tunnel" }));
  }, []);

  useEffect(() => {
    void api.backupStatus().then(setBackup, () => undefined);
  }, []);

  async function copy(url: string) {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

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

  function kick(player: PresenceUser) {
    if (window.confirm(`Expulsar ${player.name}? A sessão dele(a) será apagada.`)) {
      void run(() => api.kick(player.id));
    }
  }

  return (
    <section className="card">
      <h2>Painel do mestre</h2>

      <h3>Link para os jogadores</h3>
      {tunnel?.url ? (
        <div className="link-row">
          <code>{tunnel.url}</code>
          <button onClick={() => void copy(tunnel.url!)}>
            {copied ? "Copiado" : "Copiar link"}
          </button>
        </div>
      ) : (
        <p className="details">
          {tunnel ? (tunnel.error ?? "Sem link ainda") : "Procurando o tunnel..."}
        </p>
      )}
      <p className="details">
        O link muda toda vez que o tunnel reinicia. Cole o link novo no Discord a cada sessão.
      </p>

      {backup && isBackupStale(backup.lastBackupAt) && (
        <p className="banner" role="status">
          {backup.lastBackupAt
            ? "Faz mais de 7 dias desde o último backup."
            : "Você ainda não fez nenhum backup."}{" "}
          No terminal: <code>npm run backup</code>
        </p>
      )}

      <ScenesPanel
        scenes={scenes}
        onScenes={onScenes}
        previewId={previewId}
        onPreview={onPreview}
      />

      <FogPanel scene={shownScene} fog={fog} />

      <TokensPanel
        scene={shownScene}
        tokens={tokens}
        players={players}
        characters={characters}
        selectedId={selectedTokenId}
        onSelect={onSelectToken}
        onChange={onTokenChange}
        onRemove={onTokenRemove}
      />

      <NpcPanel scene={shownScene} characters={characters} onCreated={onCharacterCreated} />

      <InitiativeControls initiative={initiative} sceneTokens={tokens} />

      <NotesPanel />

      <h3>Jogadores</h3>
      <ul className="players">
        {players
          .filter((p) => p.id !== self.id)
          .map((p) => (
            <li key={p.id} className={p.online ? "online" : "offline"}>
              <span>{p.name}</span>
              <span className="actions">
                <button className="link" onClick={() => rename(p)}>
                  Renomear
                </button>
                <button className="link danger" onClick={() => kick(p)}>
                  Expulsar
                </button>
              </span>
            </li>
          ))}
      </ul>
      {players.length <= 1 && <p className="details">Ninguém mais entrou ainda.</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
