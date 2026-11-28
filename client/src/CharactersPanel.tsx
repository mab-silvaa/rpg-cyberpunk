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
import { Badge, Button, ErrorText, MoreMenu, Panel, SelectField, useConfirm } from "./ui";

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

/** Fichas: o jogador vê a própria; o mestre vê a lista, cria NPCs e troca o dono. */
export function CharactersPanel({
  user,
  characters,
  players,
  onSave,
  onRoll,
  onCreated,
  onRemoved,
}: Props) {
  const confirm = useConfirm();
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

  async function remove(c: CharacterView) {
    const ok = await confirm({
      title: `Excluir a ficha "${characterName(c)}"?`,
      message: "A ficha e o que está nela são apagados.",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;
    void run(async () => {
      await api.deleteCharacter(c.id);
      onRemoved(c.id);
    });
  }

  const ownerName = (c: CharacterView): string =>
    c.ownerId === null ? "NPC" : (players.find((p) => p.id === c.ownerId)?.name ?? "jogador");

  const sheet = selected && (
    <CharacterSheet key={selected.id} character={selected} onSave={onSave} onRoll={onRoll} />
  );

  if (!user.isGm) {
    return (
      <>
        {characters.length === 0 && (
          <div className="card-body">
            <p className="details">Você ainda não tem uma ficha.</p>
            <div className="actions">
              <Button variant="primary" icon="plus" onClick={() => void create(null)}>
                Criar minha ficha
              </Button>
            </div>
          </div>
        )}
        <ErrorText>{error}</ErrorText>
        {sheet}
      </>
    );
  }

  return (
    <Panel title="Fichas" gm count={characters.length}>
      <div className="actions">
        <Button icon="plus" onClick={() => void create(null)}>
          Nova ficha de NPC
        </Button>
      </div>
      <SelectField
        label="Nova ficha para um jogador"
        value=""
        onChange={(e) => e.target.value && void create(Number(e.target.value))}
      >
        <option value="">Escolha o jogador...</option>
        {players
          .filter((p) => !p.isGm)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
      </SelectField>
      <ul className="list">
        {characters.map((c) => (
          <li key={c.id} className={`row ${selected?.id === c.id ? "selected" : ""}`}>
            <span className="row-name">
              <button
                type="button"
                aria-pressed={selected?.id === c.id}
                onClick={() => setSelectedId(c.id)}
              >
                {characterName(c)}
              </button>
              <Badge tone={c.ownerId === null ? "gm" : "accent"}>{ownerName(c)}</Badge>
            </span>
            <MoreMenu
              label={`Mais ações de ${characterName(c)}`}
              items={[
                { label: "Excluir", icon: "trash", danger: true, onSelect: () => void remove(c) },
              ]}
            />
          </li>
        ))}
      </ul>
      {selected && (
        <SelectField
          label={`Dono de ${characterName(selected)}`}
          value={selected.ownerId ?? ""}
          onChange={(e) =>
            void run(() =>
              api.assignCharacter(
                selected.id,
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
        </SelectField>
      )}
      <ErrorText>{error}</ErrorText>
      {sheet}
    </Panel>
  );
}
