import { useState } from "react";
import {
  CHARACTER_NAME_FALLBACK,
  type CharacterData,
  type CharacterReply,
  type CharacterView,
  type PresenceUser,
  type RollReply,
  type RollRequest,
  type User,
} from "@vtt/shared";
import { api } from "./api";
import { CharacterSheet } from "./CharacterSheet";

interface Props {
  user: User;
  characters: CharacterView[];
  players: PresenceUser[];
  onSave: (id: number, patch: Partial<CharacterData>) => Promise<CharacterReply>;
  onRoll: (request: RollRequest) => Promise<RollReply>;
  onCreated: (character: CharacterView) => void;
  onRemoved: (id: number) => void;
}

export const characterName = (c: CharacterView): string => c.data.handle || CHARACTER_NAME_FALLBACK;

export function CharactersPanel({
  user,
  characters,
  players,
  onSave,
  onRoll,
  onCreated,
  onRemoved,
}: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState<string>();
  const selected = characters.find((c) => c.id === selectedId) ?? characters[0] ?? null;

  async function run(action: () => Promise<unknown>) {
    setError(undefined);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo deu errado");
    }
  }

  const create = (ownerId: number | null) =>
    run(async () => {
      const created = await api.createCharacter(user.isGm ? { ownerId } : {});
      onCreated(created);
      setSelectedId(created.id);
    });

  const ownerName = (c: CharacterView): string =>
    c.ownerId === null ? "NPC" : (players.find((p) => p.id === c.ownerId)?.name ?? "jogador");

  return (
    <section className="card">
      <h2>{user.isGm ? "Fichas" : "Minha ficha"}</h2>
      {characters.length === 0 && !user.isGm && (
        <p className="details">Você ainda não tem uma ficha.</p>
      )}
      {(user.isGm || characters.length === 0) && (
        <div className="row">
          {user.isGm ? (
            <>
              <button onClick={() => void create(null)}>Nova ficha de NPC</button>
              <select
                aria-label="Nova ficha para o jogador"
                value=""
                onChange={(e) => e.target.value && void create(Number(e.target.value))}
              >
                <option value="">Nova ficha para um jogador...</option>
                {players
                  .filter((p) => !p.isGm)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </>
          ) : (
            <button onClick={() => void create(null)}>Criar minha ficha</button>
          )}
        </div>
      )}
      {characters.length > 1 || (user.isGm && characters.length > 0) ? (
        <ul className="scenes characters">
          {characters.map((c) => (
            <li key={c.id} className={selected?.id === c.id ? "selected" : ""}>
              <div className="scene-line">
                <button className="link token-name" onClick={() => setSelectedId(c.id)}>
                  {characterName(c)}
                  <strong className={c.ownerId === null ? "badge preview" : "badge"}>
                    {ownerName(c)}
                  </strong>
                </button>
                {user.isGm && (
                  <span className="actions">
                    <select
                      aria-label={`Dono de ${characterName(c)}`}
                      value={c.ownerId ?? ""}
                      onChange={(e) =>
                        void run(() =>
                          api.assignCharacter(
                            c.id,
                            e.target.value === "" ? null : Number(e.target.value),
                          ),
                        )
                      }
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
                    <button
                      className="link danger"
                      onClick={() => {
                        if (window.confirm(`Excluir a ficha "${characterName(c)}"?`)) {
                          void run(async () => {
                            await api.deleteCharacter(c.id);
                            onRemoved(c.id);
                          });
                        }
                      }}
                    >
                      Excluir
                    </button>
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {selected && (
        <CharacterSheet key={selected.id} character={selected} onSave={onSave} onRoll={onRoll} />
      )}
    </section>
  );
}
