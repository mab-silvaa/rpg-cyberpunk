import { useState } from "react";
import type { FogState, SceneView } from "@vtt/shared";
import { api } from "./api";

export function FogPanel({ scene, fog }: { scene: SceneView | null; fog: FogState | null }) {
  const [error, setError] = useState<string>();
  if (!scene) return null;

  async function run(action: () => Promise<unknown>) {
    setError(undefined);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo deu errado");
    }
  }

  const enabled = fog?.enabled ?? false;
  return (
    <>
      <h3>Fog of war de "{scene.name}"</h3>
      <label className="check">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => void run(() => api.fogEnabled(scene.id, e.target.checked))}
        />
        Fog ligada (com ela, tudo começa escondido dos jogadores)
      </label>
      {enabled ? (
        <>
          <p className="details">
            Use as ferramentas de fog no mapa (retângulo e pincel, para revelar ou cobrir). Você vê
            a fog translúcida; os jogadores veem preto. Token sob fog não chega aos jogadores.
          </p>
          <div className="row fog-actions">
            <button onClick={() => void run(() => api.undoFog(scene.id))}>Desfazer</button>
            <button onClick={() => void run(() => api.revealAllFog(scene.id))}>Revelar tudo</button>
            <button
              onClick={() => {
                if (window.confirm("Cobrir o mapa inteiro de novo?")) {
                  void run(() => api.coverAllFog(scene.id));
                }
              }}
            >
              Cobrir tudo
            </button>
          </div>
        </>
      ) : (
        <p className="details">Fog desligada: os jogadores veem o mapa inteiro.</p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
