import { useState } from "react";
import { maxHp, type CharacterView, type SceneView } from "@vtt/shared";
import { api } from "./api";

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
    <>
      <h3>NPCs</h3>
      {npcs.length === 0 ? (
        <p className="details">
          Nenhum NPC. Crie uma ficha de NPC em "Fichas" e ela aparece aqui, com o atalho para
          colocar no mapa.
        </p>
      ) : (
        <>
          <label className="check">
            <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
            Colocar escondido dos jogadores
          </label>
          <ul className="scenes npcs">
            {npcs.map((npc) => (
              <li key={npc.id}>
                <div className="scene-line">
                  <span>
                    <strong>{npc.data.handle || "Sem nome"}</strong>
                    {npc.data.role && ` · ${npc.data.role}`}
                    <span className="details">
                      {" "}
                      · HP {npc.data.hpCurrent}/{maxHp(npc.data)} · SP {npc.data.headSp}/
                      {npc.data.bodySp} · REF {npc.data.stats.REF} · {npc.data.weapons.length}{" "}
                      {npc.data.weapons.length === 1 ? "arma" : "armas"}
                    </span>
                  </span>
                  <span className="actions">
                    <button
                      className="link"
                      disabled={!scene || busy}
                      onClick={() => void place(npc)}
                    >
                      Colocar no mapa
                    </button>
                    <button className="link" disabled={busy} onClick={() => void duplicate(npc)}>
                      Duplicar
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
