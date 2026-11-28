import { useState } from "react";
import type {
  CharacterData,
  CharacterReply,
  CharacterView,
  InitiativeView,
  PresenceUser,
  RollReply,
  RollRequest,
  RollResult,
  User,
} from "@vtt/shared";
import { api } from "./api";
import { DiceTab, type Dice } from "./DicePanel";
import { InitiativeList } from "./InitiativePanel";
import { PlayersPanel } from "./PlayersPanel";
import { HistoryPanel, SheetOverlay, SheetSummary, StateBox } from "./Summary";
import { Button, ErrorText, Tabs, type TabItem } from "./ui";

export type PlayerTab = "mapa" | "dados" | "ficha" | "mesa" | "historico";

/** Celular: quatro destinos embaixo (Mapa, Dados, Ficha, Mesa). */
export const PLAYER_TABS: TabItem<PlayerTab>[] = [
  { key: "mapa", label: "Mapa", icon: "map" },
  { key: "dados", label: "Dados", icon: "dice" },
  { key: "ficha", label: "Ficha", icon: "sheet" },
  { key: "mesa", label: "Mesa", icon: "users" },
];

/** PC: duas abas com rótulo ao lado do mapa (prancha 11). */
export const PLAYER_TABS_PC: TabItem<PlayerTab>[] = [
  { key: "ficha", label: "Ficha", icon: "sheet" },
  { key: "historico", label: "Histórico", icon: "clock" },
];

interface Props {
  tab: PlayerTab;
  /** Celular: a barra de dados do mapa não existe, então a aba Dados traz tudo. */
  mobile: boolean;
  user: User;
  players: PresenceUser[];
  characters: CharacterView[];
  initiative: InitiativeView;
  rolls: RollResult[];
  loading?: boolean;
  dice: Dice;
  onSaveCharacter: (id: number, patch: Partial<CharacterData>) => Promise<CharacterReply>;
  onRoll: (request: RollRequest) => Promise<RollReply>;
  onCharacterCreated: (character: CharacterView) => void;
  onCharacterRemoved: (id: number) => void;
}

/** Ficha resumida do jogador, ou "sem ficha" com a saída para criar uma. */
function MySheet({ props }: { props: Props }) {
  const { user, characters, mobile } = props;
  const mine = characters.find((c) => c.ownerId === user.id) ?? characters[0];
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();

  async function create() {
    setError(undefined);
    try {
      props.onCharacterCreated(await api.createCharacter({}));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo deu errado");
    }
  }

  if (!mine) {
    return (
      <>
        <StateBox
          icon="sheet"
          title="Você ainda não tem ficha"
          text="O mestre ou você pode criar uma para começar."
          action={
            <Button variant="primary" icon="plus" onClick={() => void create()}>
              Criar ficha
            </Button>
          }
        />
        <ErrorText>{error}</ErrorText>
      </>
    );
  }
  return (
    <>
      <SheetSummary
        character={mine}
        mobile={mobile}
        onRoll={props.onRoll}
        onOpen={() => setOpen(true)}
      />
      {open && (
        <SheetOverlay
          character={mine}
          onSave={props.onSaveCharacter}
          onRoll={props.onRoll}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** Conteúdo da aba do jogador, no painel lateral (PC) ou abaixo do mapa (celular). */
export function PlayerContent(props: Props) {
  const { tab, mobile, user, rolls, dice } = props;
  switch (tab) {
    case "mapa":
      return (
        <>
          <InitiativeList initiative={props.initiative} />
          {props.initiative.entries.length === 0 && props.initiative.round === 0 && (
            <p className="details">Nenhum combate em andamento.</p>
          )}
        </>
      );
    case "dados":
      return (
        <>
          <DiceTab dice={dice} isGm={false} />
          <HistoryPanel rolls={rolls} selfId={user.id} isGm={false} loading={props.loading} />
        </>
      );
    case "historico":
      return <HistoryPanel rolls={rolls} selfId={user.id} isGm={false} loading={props.loading} />;
    case "ficha":
      return <MySheet props={props} />;
    case "mesa":
      return <PlayersPanel self={user} players={props.players} />;
  }
  void mobile;
}

export function PlayerTabs({
  active,
  onChange,
  tabs = PLAYER_TABS,
  counts,
}: {
  active: PlayerTab;
  onChange: (tab: PlayerTab) => void;
  tabs?: TabItem<PlayerTab>[];
  counts?: Partial<Record<PlayerTab, number>>;
}) {
  return (
    <Tabs
      tabs={tabs.map((t) => ({ ...t, count: counts?.[t.key] }))}
      active={active}
      onChange={onChange}
      label="Mesa"
    />
  );
}
