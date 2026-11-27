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
import { CharactersPanel } from "./CharactersPanel";
import { DiceTab, RollHistory, TestControls, type Dice } from "./DicePanel";
import { InitiativeList } from "./InitiativePanel";
import { PlayersPanel } from "./PlayersPanel";
import { Panel, Tabs, type TabItem } from "./ui";

export type PlayerTab = "mapa" | "dados" | "ficha" | "mesa";

/** Mesmos quatro destinos do celular (Mapa, Dados, Ficha, Mesa); no PC o mapa já está à esquerda. */
export const PLAYER_TABS: TabItem<PlayerTab>[] = [
  { key: "mapa", label: "Mapa", icon: "map" },
  { key: "dados", label: "Dados", icon: "dice" },
  { key: "ficha", label: "Ficha", icon: "sheet" },
  { key: "mesa", label: "Mesa", icon: "users" },
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
  dice: Dice;
  onSaveCharacter: (id: number, patch: Partial<CharacterData>) => Promise<CharacterReply>;
  onRoll: (request: RollRequest) => Promise<RollReply>;
  onCharacterCreated: (character: CharacterView) => void;
  onCharacterRemoved: (id: number) => void;
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
      return mobile ? (
        <>
          <DiceTab dice={dice} isGm={false} rolls={rolls} />
          <RollHistory rolls={rolls} />
        </>
      ) : (
        <Panel title="Dados" count={rolls.length}>
          <TestControls dice={dice} isGm={false} />
          <RollHistory rolls={rolls} />
        </Panel>
      );
    case "ficha":
      return (
        <CharactersPanel
          user={user}
          characters={props.characters}
          players={props.players}
          onSave={props.onSaveCharacter}
          onRoll={props.onRoll}
          onCreated={props.onCharacterCreated}
          onRemoved={props.onCharacterRemoved}
        />
      );
    case "mesa":
      return <PlayersPanel self={user} players={props.players} />;
  }
}

export function PlayerTabs({
  active,
  onChange,
  tabs = PLAYER_TABS,
}: {
  active: PlayerTab;
  onChange: (tab: PlayerTab) => void;
  tabs?: TabItem<PlayerTab>[];
}) {
  return <Tabs tabs={tabs} active={active} onChange={onChange} label="Mesa" />;
}
