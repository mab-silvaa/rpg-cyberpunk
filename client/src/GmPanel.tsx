import { useEffect, useState } from "react";
import type {
  BackupStatus,
  CharacterData,
  CharacterReply,
  CharacterView,
  FogState,
  InitiativeView,
  PresenceUser,
  RollReply,
  RollRequest,
  RollResult,
  SceneSummary,
  SceneView,
  TokenView,
  TunnelInfo,
  User,
} from "@vtt/shared";
import { api } from "./api";
import { type Dice } from "./DicePanel";
import { FogPanel } from "./FogPanel";
import { InitiativeControls } from "./InitiativePanel";
import { NotesPanel } from "./NotesPanel";
import { NpcPanel } from "./NpcPanel";
import { PlayersPanel } from "./PlayersPanel";
import { ScenesPanel } from "./ScenesPanel";
import { TokensPanel } from "./TokensPanel";
import { GmSheetsPanel, HistoryPanel, SheetOverlay } from "./Summary";
import { Alert, Button, ErrorText, Panel, Tabs, type TabItem } from "./ui";
import { useUnseen } from "./useUnseen";

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
  onCharacterRemoved: (id: number) => void;
  onSaveCharacter: (id: number, patch: Partial<CharacterData>) => Promise<CharacterReply>;
  onRoll: (request: RollRequest) => Promise<RollReply>;
  rolls: RollResult[];
  dice: Dice;
  initiative: InitiativeView;
  selectedTokenId: number | null;
  onSelectToken: (id: number | null) => void;
  onTokenChange: (token: TokenView) => void;
  onTokenRemove: (id: number) => void;
  tunnel: TunnelInfo | undefined;
  onCopyLink: () => void;
}

type GmTab = "cena" | "tokens" | "combate" | "notas" | "mesa" | "fichas" | "historico";
const TABS: TabItem<GmTab>[] = [
  { key: "cena", label: "Cena", icon: "map" },
  { key: "tokens", label: "Tokens", icon: "dice" },
  { key: "combate", label: "Combate", icon: "order" },
  { key: "notas", label: "Notas", icon: "note" },
  { key: "mesa", label: "Mesa", icon: "users" },
  { key: "fichas", label: "Fichas", icon: "sheet" },
  { key: "historico", label: "Histórico", icon: "clock" },
];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const isBackupStale = (at: string | null): boolean => !at || Date.now() - Date.parse(at) > WEEK_MS;

/** Painel do mestre: uma aba por vez, ao lado do mapa. */
export function GmPanel(props: Props) {
  const { self, tunnel } = props;
  const [tab, setTab] = useState<GmTab>("cena");
  const [backup, setBackup] = useState<BackupStatus>();
  const [openSheetId, setOpenSheetId] = useState<number | null>(null);
  const [sheetsError, setSheetsError] = useState<string>();
  const unseenRolls = useUnseen(props.rolls, tab === "historico");
  const openSheet = props.characters.find((c) => c.id === openSheetId);

  useEffect(() => {
    void api.backupStatus().then(setBackup, () => undefined);
  }, []);

  return (
    <>
      <Tabs
        tabs={TABS.map((t) => (t.key === "historico" ? { ...t, count: unseenRolls } : t))}
        active={tab}
        onChange={setTab}
        gm
        iconOnly
        label="Painel do mestre"
      />
      <h2 className="side-title">{TABS.find((t) => t.key === tab)?.label}</h2>
      <div className="side-scroll" role="tabpanel">
        {tab === "cena" && (
          <>
            {backup && isBackupStale(backup.lastBackupAt) && (
              <Alert tone="warn" icon="alert">
                {backup.lastBackupAt
                  ? "Faz mais de 7 dias desde o último backup."
                  : "Você ainda não fez nenhum backup."}{" "}
                No terminal: <code>npm run backup</code>
              </Alert>
            )}
            <ScenesPanel
              scenes={props.scenes}
              onScenes={props.onScenes}
              previewId={props.previewId}
              onPreview={props.onPreview}
            />
            <FogPanel scene={props.shownScene} fog={props.fog} />
            <Panel title="Link para os jogadores" gm>
              {tunnel?.url ? (
                <div className="actions">
                  <code style={{ wordBreak: "break-all", flex: 1 }}>{tunnel.url}</code>
                  <Button icon="copy" size="sm" onClick={props.onCopyLink}>
                    Copiar link
                  </Button>
                </div>
              ) : (
                <p className="details">
                  {tunnel ? (tunnel.error ?? "Sem link ainda") : "Procurando o tunnel..."}
                </p>
              )}
              <p className="details">
                O link muda toda vez que o tunnel reinicia. Cole o link novo no Discord a cada
                sessão.
              </p>
            </Panel>
          </>
        )}
        {tab === "tokens" && (
          <>
            <TokensPanel
              scene={props.shownScene}
              tokens={props.tokens}
              players={props.players}
              characters={props.characters}
              selectedId={props.selectedTokenId}
              onSelect={props.onSelectToken}
              onChange={props.onTokenChange}
              onRemove={props.onTokenRemove}
              onSaveCharacter={props.onSaveCharacter}
            />
            <NpcPanel
              scene={props.shownScene}
              characters={props.characters}
              onCreated={props.onCharacterCreated}
            />
          </>
        )}
        {tab === "combate" && (
          <InitiativeControls initiative={props.initiative} sceneTokens={props.tokens} />
        )}
        {tab === "notas" && <NotesPanel />}
        {tab === "mesa" && <PlayersPanel self={self} players={props.players} />}
        {tab === "fichas" && (
          <>
            <GmSheetsPanel
              characters={props.characters}
              players={props.players}
              onOpen={setOpenSheetId}
              onCreated={(c) => {
                props.onCharacterCreated(c);
                setOpenSheetId(c.id);
              }}
              onRemoved={props.onCharacterRemoved}
              onError={setSheetsError}
            />
            <ErrorText>{sheetsError}</ErrorText>
          </>
        )}
        {tab === "historico" && <HistoryPanel rolls={props.rolls} selfId={self.id} isGm />}
      </div>
      {openSheet && (
        <SheetOverlay
          character={openSheet}
          players={props.players}
          onAssign={(ownerId) =>
            void api
              .assignCharacter(openSheet.id, ownerId)
              .catch((e: unknown) =>
                setSheetsError(e instanceof Error ? e.message : "Algo deu errado"),
              )
          }
          onSave={props.onSaveCharacter}
          onRoll={props.onRoll}
          onClose={() => setOpenSheetId(null)}
        />
      )}
    </>
  );
}
