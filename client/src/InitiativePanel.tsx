import { useState, type FormEvent } from "react";
import { INITIATIVE_NAME_MAX_LENGTH, type InitiativeView, type TokenView } from "@vtt/shared";
import { api } from "./api";

/** Iniciativa para os jogadores: só a ordem e quem está na vez. */
export function InitiativeList({ initiative }: { initiative: InitiativeView }) {
  if (initiative.entries.length === 0 && initiative.round === 0) return null;
  return (
    <section className="card">
      <h2>Iniciativa{initiative.round > 0 ? ` · rodada ${initiative.round}` : ""}</h2>
      <ol className="initiative">
        {initiative.entries.map((entry) => (
          <li key={entry.id} className={entry.id === initiative.activeId ? "active" : ""}>
            {entry.name}
            {entry.id === initiative.activeId && <strong className="badge">na vez</strong>}
          </li>
        ))}
      </ol>
    </section>
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

  const started = initiative.round > 0;
  return (
    <>
      <h3>Iniciativa{started ? ` · rodada ${initiative.round}` : ""}</h3>
      <div className="row fog-actions">
        {started ? (
          <>
            <button onClick={() => void run(() => api.nextInitiative())}>Próxima vez</button>
            <button onClick={() => void run(() => api.endInitiative())}>Encerrar combate</button>
          </>
        ) : (
          <button onClick={() => void run(() => api.startInitiative())}>Iniciar combate</button>
        )}
        <button
          disabled={sceneTokens.length === 0}
          onClick={() => void run(() => api.initiativeFromTokens(sceneTokens.map((t) => t.id)))}
        >
          Adicionar tokens da cena
        </button>
        <button onClick={() => void run(() => api.rollInitiative())}>
          Rolar quem está sem valor
        </button>
        <button
          className="link danger"
          onClick={() => {
            if (window.confirm("Esvaziar a iniciativa?")) void run(() => api.clearInitiative());
          }}
        >
          Limpar
        </button>
      </div>
      <ol className="initiative gm">
        {initiative.entries.map((entry) => (
          <li key={entry.id} className={entry.id === initiative.activeId ? "active" : ""}>
            <span>
              {entry.name}
              {entry.id === initiative.activeId && <strong className="badge">na vez</strong>}
              {entry.hidden && <strong className="badge preview">oculta</strong>}
            </span>
            <span className="actions">
              <input
                type="number"
                aria-label={`Iniciativa de ${entry.name}`}
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
              <button
                className="link"
                onClick={() =>
                  void run(() => api.updateInitiative(entry.id, { hidden: !entry.hidden }))
                }
              >
                {entry.hidden ? "Mostrar" : "Esconder"}
              </button>
              <button
                className="link danger"
                onClick={() => void run(() => api.removeInitiative(entry.id))}
              >
                Tirar
              </button>
            </span>
          </li>
        ))}
      </ol>
      {initiative.entries.length === 0 && (
        <p className="details">
          Ninguém na iniciativa. Acrescente abaixo ou use os tokens da cena.
        </p>
      )}
      <form className="dice-form" onSubmit={submit}>
        <input
          aria-label="Nome na iniciativa"
          placeholder="Nome"
          value={name}
          maxLength={INITIATIVE_NAME_MAX_LENGTH}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          aria-label="Valor na iniciativa"
          type="number"
          placeholder="Valor"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="submit">Acrescentar</button>
      </form>
      <p className="details">
        Os jogadores veem só a ordem, sem os valores e sem as entradas ocultas.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
