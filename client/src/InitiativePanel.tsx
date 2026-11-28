import { Fragment, useState, type FormEvent } from "react";
import { INITIATIVE_NAME_MAX_LENGTH, type InitiativeView, type TokenView } from "@vtt/shared";
import { api } from "./api";
import { Icon } from "./icons";
import { Badge, Button, ErrorText, MoreMenu, Panel, useConfirm } from "./ui";

/** Quem está derrotado sai da ordem e desce para o grupo "Derrotados" (prancha 16). */
const splitDefeated = (i: InitiativeView) => ({
  alive: i.entries.filter((e) => !e.defeated),
  defeated: i.entries.filter((e) => e.defeated),
});

const hasCombat = (i: InitiativeView): boolean => i.entries.length > 0 || i.round > 0;

/** Faixa de iniciativa sobre o mapa. O mestre também tem "Próxima vez". */
export function InitiativeBar({ initiative, isGm }: { initiative: InitiativeView; isGm: boolean }) {
  const [error, setError] = useState<string>();
  if (!hasCombat(initiative)) return null;
  const started = initiative.round > 0;
  const { alive, defeated } = splitDefeated(initiative);
  return (
    <div className="init-bar" aria-label="Iniciativa">
      <div className="init-round">
        <span className="t-label" style={{ fontSize: 10 }}>
          Rodada
        </span>
        <b>{started ? initiative.round : "–"}</b>
      </div>
      {alive.map((entry, i) => (
        <div
          key={entry.id}
          className={`init-chip ${entry.id === initiative.activeId ? "active" : ""}`}
          aria-current={entry.id === initiative.activeId ? "true" : undefined}
        >
          <span className="n">{i + 1}</span>
          {entry.name}
          {entry.hidden && <Icon name="eyeoff" size={14} />}
        </div>
      ))}
      {defeated.length > 0 && (
        <>
          <span className="t-label init-defeated-label">Derrotados · {defeated.length}</span>
          {defeated.map((entry) => (
            <div key={entry.id} className="init-chip defeated">
              {entry.name}
              {entry.hidden && <Icon name="eyeoff" size={14} />}
            </div>
          ))}
        </>
      )}
      {isGm && started && (
        <Button
          variant="primary"
          size="sm"
          icon="play"
          onClick={() => {
            setError(undefined);
            api.nextInitiative().catch((e: unknown) => {
              setError(e instanceof Error ? e.message : "Algo deu errado");
            });
          }}
        >
          Próxima vez
        </Button>
      )}
      {error && <span className="field-msg">{error}</span>}
    </div>
  );
}

/** Iniciativa para os jogadores: só a ordem e quem está na vez. */
export function InitiativeList({ initiative }: { initiative: InitiativeView }) {
  if (!hasCombat(initiative)) return null;
  const { alive, defeated } = splitDefeated(initiative);
  return (
    <Panel
      title={`Iniciativa${initiative.round > 0 ? ` · rodada ${initiative.round}` : ""}`}
      count={initiative.entries.length}
    >
      <ol className="list" style={{ listStyle: "none", padding: 0 }}>
        {alive.map((entry, i) => (
          <li
            key={entry.id}
            className="row"
            style={
              entry.id === initiative.activeId
                ? { background: "var(--turn)", borderColor: "var(--turn)", color: "var(--bg)" }
                : undefined
            }
          >
            <span
              className="t-mono"
              style={{ color: entry.id === initiative.activeId ? "var(--bg)" : "var(--turn)" }}
            >
              {i + 1}
            </span>
            <span className="row-name">{entry.name}</span>
            {entry.id === initiative.activeId && (
              <Badge tone="turn" solid>
                Na vez
              </Badge>
            )}
          </li>
        ))}
      </ol>
      {defeated.length > 0 && (
        <details className="defeated-group">
          <summary className="t-label">Derrotados · {defeated.length}</summary>
          <ul className="list" style={{ listStyle: "none", padding: 0 }}>
            {defeated.map((entry) => (
              <li key={entry.id} className="row defeated">
                <span className="row-name">
                  <s>{entry.name}</s>
                  <Badge tone="danger">Derrotado</Badge>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  );
}

/** Iniciativa do mestre: valores, ocultas, rolagem para NPCs e controle de turnos. */
export function InitiativeControls({
  initiative,
  sceneTokens,
}: {
  initiative: InitiativeView;
  sceneTokens: TokenView[];
}) {
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();

  async function run(action: () => Promise<unknown>) {
    setError(undefined);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo deu errado");
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await api.addInitiative({ name, value: value === "" ? null : Number(value) });
      setName("");
      setValue("");
    });
  }

  async function clear() {
    const ok = await confirm({
      title: "Esvaziar a iniciativa?",
      message: "Todos saem da ordem e o combate acaba.",
      confirmLabel: "Limpar",
      danger: true,
    });
    if (ok) void run(() => api.clearInitiative());
  }

  const started = initiative.round > 0;
  const { alive, defeated } = splitDefeated(initiative);
  return (
    <Panel
      title={`Combate${started ? ` · rodada ${initiative.round}` : ""}`}
      gm
      count={initiative.entries.length}
    >
      <div className="actions">
        {started ? (
          <>
            <Button
              variant="primary"
              size="sm"
              icon="play"
              onClick={() => void run(() => api.nextInitiative())}
            >
              Próxima vez
            </Button>
            <Button size="sm" onClick={() => void run(() => api.endInitiative())}>
              Encerrar combate
            </Button>
          </>
        ) : (
          <Button
            variant="primary"
            size="sm"
            icon="play"
            onClick={() => void run(() => api.startInitiative())}
          >
            Iniciar combate
          </Button>
        )}
      </div>
      <div className="actions">
        <Button
          size="sm"
          disabled={sceneTokens.length === 0}
          onClick={() => void run(() => api.initiativeFromTokens(sceneTokens.map((t) => t.id)))}
        >
          Adicionar tokens da cena
        </Button>
        <Button size="sm" icon="dice" onClick={() => void run(() => api.rollInitiative())}>
          Rolar quem está sem valor
        </Button>
        <Button size="sm" variant="danger" icon="trash" onClick={() => void clear()}>
          Limpar
        </Button>
      </div>
      <ol className="list" style={{ listStyle: "none", padding: 0 }}>
        {[...alive, ...defeated].map((entry, i) => (
          <Fragment key={entry.id}>
            {entry.defeated && i === alive.length && (
              <li className="t-label defeated-heading">Derrotados · {defeated.length}</li>
            )}
            <li
              className={`row ${entry.defeated ? "defeated" : ""}`}
              style={
                entry.id === initiative.activeId
                  ? { borderColor: "var(--turn)", background: "rgba(255,198,26,0.1)" }
                  : undefined
              }
            >
              <span className="t-mono" style={{ color: "var(--turn)", width: 16 }}>
                {entry.defeated ? "–" : i + 1}
              </span>
              <span className="row-name">
                {entry.defeated ? <s>{entry.name}</s> : entry.name}
                {entry.defeated && <Badge tone="danger">Derrotado</Badge>}
                {entry.id === initiative.activeId && <Badge tone="turn">Na vez</Badge>}
                {entry.hidden && (
                  <Badge tone="gm" icon="eyeoff">
                    Oculta
                  </Badge>
                )}
              </span>
              <span className="control mono" style={{ width: 64, height: 36, flex: "none" }}>
                <input
                  type="number"
                  aria-label={`Iniciativa de ${entry.name}`}
                  style={{ height: 34, padding: "0 8px", textAlign: "center" }}
                  value={entry.value ?? ""}
                  placeholder="—"
                  onChange={(e) =>
                    void run(() =>
                      api.updateInitiative(entry.id, {
                        value: e.target.value === "" ? null : Number(e.target.value),
                      }),
                    )
                  }
                />
              </span>
              <MoreMenu
                label={`Mais ações de ${entry.name}`}
                items={[
                  {
                    label: entry.hidden ? "Mostrar" : "Esconder",
                    icon: entry.hidden ? "eye" : "eyeoff",
                    onSelect: () =>
                      void run(() => api.updateInitiative(entry.id, { hidden: !entry.hidden })),
                  },
                  {
                    label: "Tirar",
                    icon: "trash",
                    danger: true,
                    onSelect: () => void run(() => api.removeInitiative(entry.id)),
                  },
                ]}
              />
            </li>
          </Fragment>
        ))}
      </ol>
      {initiative.entries.length === 0 && (
        <p className="details">
          Ninguém na iniciativa. Acrescente abaixo ou use os tokens da cena.
        </p>
      )}
      <form className="form-row" onSubmit={submit}>
        <label className="field" style={{ flex: "2 1 140px" }}>
          <span className="t-label">Nome na iniciativa</span>
          <span className="control">
            <input
              placeholder="Nome"
              value={name}
              maxLength={INITIATIVE_NAME_MAX_LENGTH}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </span>
        </label>
        <label className="field" style={{ flex: "1 1 80px" }}>
          <span className="t-label">Valor na iniciativa</span>
          <span className="control mono">
            <input
              type="number"
              placeholder="Valor"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </span>
        </label>
        <Button type="submit" icon="plus">
          Acrescentar
        </Button>
      </form>
      <p className="details">
        Os jogadores veem só a ordem, sem os valores e sem as entradas ocultas.
      </p>
      <ErrorText>{error}</ErrorText>
    </Panel>
  );
}
