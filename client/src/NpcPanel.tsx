import { useState } from "react";
import { maxHp, type CharacterView, type SceneView } from "@vtt/shared";
import { api } from "./api";
import { Button, CheckField, ErrorText, MoreMenu, Panel } from "./ui";

interface Props {
  scene: SceneView | null;
  characters: CharacterView[];
  onCreated: (character: CharacterView) => void;
}

/** NPCs do mestre (fichas sem jogador): resumo e atalhos para colocar no mapa. */
export function NpcPanel({ scene, characters, onCreated }: Props) {
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const npcs = characters.filter((c) => c.ownerId === null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo deu errado");
    } finally {
      setBusy(false);
    }
  }

  const place = (npc: CharacterView) =>
    run(() =>
      api.createToken({
        sceneId: scene!.id,
        name: npc.data.handle || "NPC",
        characterId: npc.id,
        hidden,
      }),
    );

  const duplicate = (npc: CharacterView) =>
    run(async () => onCreated(await api.createCharacter({ ownerId: null, data: npc.data })));

  return (
    <Panel title="NPCs" gm count={npcs.length}>
      {npcs.length === 0 ? (
        <p className="details">
          Nenhum NPC. Crie uma ficha de NPC na aba Mesa e ela aparece aqui, com o atalho para
          colocar no mapa.
        </p>
      ) : (
        <>
          <CheckField
            label="Colocar escondido dos jogadores"
            gm
            checked={hidden}
            onChange={(e) => setHidden(e.target.checked)}
          />
          <ul className="list">
            {npcs.map((npc) => (
              <li key={npc.id} className="row">
                <span className="row-name">
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                    <strong>{npc.data.handle || "Sem nome"}</strong>
                    {npc.data.role && ` · ${npc.data.role}`}
                    <span className="row-sub t-mono">
                      HP {npc.data.hpCurrent}/{maxHp(npc.data)} · SP {npc.data.headSp}/
                      {npc.data.bodySp} · REF {npc.data.stats.REF} · {npc.data.weapons.length}{" "}
                      {npc.data.weapons.length === 1 ? "arma" : "armas"}
                    </span>
                  </span>
                </span>
                <Button size="sm" disabled={!scene || busy} onClick={() => void place(npc)}>
                  Colocar no mapa
                </Button>
                <MoreMenu
                  label={`Mais ações de ${npc.data.handle || "NPC"}`}
                  items={[{ label: "Duplicar", icon: "copy", onSelect: () => void duplicate(npc) }]}
                />
              </li>
            ))}
          </ul>
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </Panel>
  );
}
