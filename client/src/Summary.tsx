import { useEffect, useState, type ReactNode } from "react";
import {
  CHARACTER_NAME_FALLBACK,
  deathSave,
  humanityMax,
  maxHp,
  checkExpression,
  skillTotal,
  STAT_KEYS,
  woundState,
  type CharacterData,
  type CharacterReply,
  type CharacterView,
  type PresenceUser,
  type RollReply,
  type RollRequest,
  type RollResult,
} from "@vtt/shared";
import { api } from "./api";
import { CharacterSheet, Vital } from "./CharacterSheet";
import { RollCard } from "./DicePanel";
import { Icon } from "./icons";
import { Badge, Button, Card, IconButton, MoreMenu, SegmentedFilter, useConfirm } from "./ui";

const name = (c: CharacterView): string => c.data.handle || CHARACTER_NAME_FALLBACK;

export function WoundBadge({ data }: { data: CharacterData }) {
  const wound = woundState(data);
  return wound === "mortal" ? (
    <Badge tone="danger" icon="alert">
      Mortalmente ferido
    </Badge>
  ) : wound === "serious" ? (
    <Badge tone="turn" icon="alert">
      Gravemente ferido
    </Badge>
  ) : (
    <Badge tone="ok">Em pé</Badge>
  );
}

/** Ficha resumida: o que se olha o tempo todo, com a rolagem a um toque. */
export function SheetSummary({
  character,
  onRoll,
  onOpen,
  mobile,
}: {
  character: CharacterView;
  onRoll: (request: RollRequest) => Promise<RollReply>;
  onOpen: () => void;
  mobile?: boolean;
}) {
  const data = character.data;
  const roll = (expression: string, label: string) => void onRoll({ expression, label });
  const top = [...data.skills]
    .filter((s) => s.level > 0)
    .sort((a, b) => skillTotal(data, b) - skillTotal(data, a))
    .slice(0, 3);
  return (
    <Card>
      <div className="card-body">
        <div className="summary-head">
          <h3>Minha ficha</h3>
          <Button size="sm" icon="sheet" onClick={onOpen}>
            {mobile ? "Abrir" : "Abrir ficha"}
          </Button>
        </div>
        <div>
          <div className="t-label">Handle</div>
          <div className="sheet-handle">{data.handle || "Sem nome"}</div>
          <div className="actions" style={{ marginTop: 4 }}>
            <WoundBadge data={data} />
            <span className="details">
              {data.role || "Sem role"} · Rank {data.rank}
            </span>
          </div>
        </div>
        <div className="vitals">
          <Vital icon="heart" label="HP" value={data.hpCurrent} max={maxHp(data)} tone="ok" />
          <Vital
            icon="shield"
            label="SP cabeça"
            value={data.headSp}
            max={data.headSpMax}
            tone="accent"
          />
          {!mobile && (
            <Vital
              icon="shield"
              label="SP corpo"
              value={data.bodySp}
              max={data.bodySpMax}
              tone="accent"
            />
          )}
          <Vital
            icon="user"
            label="Humanity"
            value={data.humanityCurrent}
            max={humanityMax(data)}
            tone="turn"
          />
        </div>
        <div className="stat-grid">
          {STAT_KEYS.map((key) => (
            <div className="stat-chip" key={key}>
              <span className="t-label">{key}</span>
              <b>{data.stats[key]}</b>
            </div>
          ))}
        </div>
        <div className="actions">
          <Button
            size="sm"
            icon="dice"
            onClick={() => roll(`1d10+${data.stats.REF}`, "Iniciativa")}
          >
            Iniciativa
          </Button>
          <Button
            size="sm"
            onClick={() => roll("1d10", `Death Save (precisa tirar menos que ${deathSave(data)})`)}
          >
            Death Save
          </Button>
        </div>
        {!mobile &&
          top.map((s) => (
            <div className="quick-skill" key={s.name}>
              <span>{s.name}</span>
              <b className="t-mono">{skillTotal(data, s)}</b>
              <IconButton
                icon="dice"
                size="sm"
                variant="ghost"
                label={`Rolar ${s.name}`}
                onClick={() => roll(checkExpression(skillTotal(data, s)), s.name)}
              />
            </div>
          ))}
      </div>
    </Card>
  );
}

/** Estado vazio / sem ficha / carregando / erro: nunca uma área em branco. */
export function StateBox({
  tone,
  icon,
  title,
  text,
  action,
}: {
  tone?: "error" | "loading";
  icon: "dice" | "sheet" | "alert" | "refresh";
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className={`state-box ${tone ?? ""}`} role={tone === "error" ? "alert" : "status"}>
      <Icon name={icon} size={28} />
      <strong>{title}</strong>
      {text && <span className="details">{text}</span>}
      {action}
    </div>
  );
}

export type HistoryFilter = "todas" | "minhas" | "secretas";

/** Histórico de rolagens: Todas/Minhas (jogador) ou Todas/Secretas (mestre). */
export function HistoryPanel({
  rolls,
  selfId,
  isGm,
  loading,
}: {
  rolls: RollResult[];
  selfId: number;
  isGm: boolean;
  loading?: boolean;
}) {
  const [filter, setFilter] = useState<HistoryFilter>("todas");
  const filters: { key: HistoryFilter; label: string }[] = isGm
    ? [
        { key: "todas", label: "Todas" },
        { key: "secretas", label: "Secretas" },
      ]
    : [
        { key: "todas", label: "Todas" },
        { key: "minhas", label: "Minhas" },
      ];
  const shown = rolls.filter((r) =>
    filter === "minhas" ? r.userId === selfId : filter === "secretas" ? r.secret : true,
  );
  return (
    <>
      <div className="filter-row">
        <span className="t-label grow">Últimas 100</span>
        <SegmentedFilter
          label="Filtrar rolagens"
          options={filters}
          value={filter}
          onChange={setFilter}
          gm={isGm}
          size="sm"
        />
      </div>
      {loading ? (
        <StateBox tone="loading" icon="refresh" title="Carregando histórico…" />
      ) : shown.length === 0 ? (
        <StateBox
          icon="dice"
          title="Nenhuma rolagem ainda"
          text={filter === "secretas" ? "Nenhuma rolagem secreta." : "Role um dado para ver aqui."}
        />
      ) : (
        <ul className="rolls" aria-label="Histórico de rolagens">
          {[...shown].reverse().map((roll) => (
            <RollCard key={roll.id} roll={roll} />
          ))}
        </ul>
      )}
      {isGm && <p className="details">Rolagens secretas só aparecem para o mestre.</p>}
    </>
  );
}

/** Folha aberta sobre a mesa (Abrir ficha). Esc ou Fechar volta ao mapa. */
export function SheetOverlay({
  character,
  readOnly,
  players,
  onAssign,
  onSave,
  onRoll,
  onClose,
}: {
  character: CharacterView;
  readOnly?: boolean;
  /** Mestre: troca o dono da ficha. */
  players?: PresenceUser[];
  onAssign?: (ownerId: number | null) => void;
  onSave: (id: number, patch: Partial<CharacterData>) => Promise<CharacterReply>;
  onRoll: (request: RollRequest) => Promise<RollReply>;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="sheet-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="sheet-frame"
        role="dialog"
        aria-modal="true"
        aria-label={`Ficha de ${name(character)}`}
      >
        <div className="sheet-frame-head">
          <span className="grow" />
          {onAssign && players && (
            <label className="owner-select">
              <span className="t-label">Dono</span>
              <span className="control">
                <select
                  aria-label={`Dono de ${name(character)}`}
                  value={character.ownerId ?? ""}
                  onChange={(e) => onAssign(e.target.value === "" ? null : Number(e.target.value))}
                >
                  <option value="">NPC (sem jogador)</option>
                  {players
                    .filter((p) => !p.isGm)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </span>
            </label>
          )}
          <Button size="sm" variant="ghost" icon="x" onClick={onClose}>
            Fechar
          </Button>
        </div>
        <div className="sheet-frame-body">
          <CharacterSheet
            key={character.id}
            character={character}
            readOnly={readOnly}
            onSave={onSave}
            onRoll={onRoll}
          />
        </div>
      </div>
    </div>
  );
}

type SheetFilter = "todas" | "jogadores" | "npcs";

/** Aba Fichas do mestre: jogadores e NPCs, com HP e filtro. */
export function GmSheetsPanel({
  characters,
  players,
  onOpen,
  onCreated,
  onRemoved,
  onError,
}: {
  characters: CharacterView[];
  players: PresenceUser[];
  onOpen: (id: number) => void;
  onCreated: (c: CharacterView) => void;
  onRemoved: (id: number) => void;
  onError: (message: string) => void;
}) {
  const confirm = useConfirm();
  const [filter, setFilter] = useState<SheetFilter>("todas");
  const ownerName = (c: CharacterView) =>
    players.find((p) => p.id === c.ownerId)?.name ?? "jogador";

  async function create(ownerId: number | null) {
    try {
      const created = await api.createCharacter({ ownerId });
      onCreated(created);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Algo deu errado");
    }
  }

  async function remove(c: CharacterView) {
    const ok = await confirm({
      title: `Excluir a ficha "${name(c)}"?`,
      message: "A ficha e o que está nela são apagados.",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteCharacter(c.id);
      onRemoved(c.id);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Algo deu errado");
    }
  }

  const mine = characters.filter((c) => c.ownerId !== null);
  const npcs = characters.filter((c) => c.ownerId === null);
  const section = (title: string, list: CharacterView[]) =>
    list.length > 0 && (
      <>
        <h4 className="t-block">{title}</h4>
        <ul className="list">
          {list.map((c) => (
            <li key={c.id} className="row">
              <span className="row-name">
                <button type="button" onClick={() => onOpen(c.id)}>
                  {name(c)}
                </button>
                <Badge tone={c.ownerId === null ? "gm" : "accent"}>
                  {c.ownerId === null ? "NPC" : ownerName(c)}
                </Badge>
              </span>
              <span
                className="t-mono details"
                style={c.data.hpCurrent <= 0 ? { color: "var(--danger)" } : undefined}
              >
                {c.data.hpCurrent}/{maxHp(c.data)}
              </span>
              <IconButton
                icon="sheet"
                label={`Abrir ficha de ${name(c)}`}
                size="sm"
                variant="ghost"
                onClick={() => onOpen(c.id)}
              />
              <MoreMenu
                label={`Mais ações de ${name(c)}`}
                items={[
                  { label: "Excluir", icon: "trash", danger: true, onSelect: () => void remove(c) },
                ]}
              />
            </li>
          ))}
        </ul>
      </>
    );

  const filters: { key: SheetFilter; label: string }[] = [
    { key: "todas", label: "Todas" },
    { key: "jogadores", label: "Jogadores" },
    { key: "npcs", label: "NPCs" },
  ];
  return (
    <>
      <div className="filter-row">
        <Badge>{characters.length}</Badge>
        <span className="grow" />
        <SegmentedFilter
          label="Filtrar fichas"
          options={filters}
          value={filter}
          onChange={setFilter}
          gm
          size="sm"
        />
      </div>
      {characters.length === 0 && (
        <StateBox
          icon="sheet"
          title="Nenhuma ficha ainda"
          text="Crie uma ficha de NPC ou para um jogador."
        />
      )}
      {filter !== "npcs" && section("Jogadores", mine)}
      {filter !== "jogadores" && section("NPCs", npcs)}
      <div className="actions">
        <Button icon="plus" onClick={() => void create(null)}>
          Nova ficha de NPC
        </Button>
      </div>
      <label className="field">
        <span className="t-label">Nova ficha para um jogador</span>
        <span className="control">
          <select value="" onChange={(e) => e.target.value && void create(Number(e.target.value))}>
            <option value="">Escolha o jogador...</option>
            {players
              .filter((p) => !p.isGm)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </span>
      </label>
    </>
  );
}
