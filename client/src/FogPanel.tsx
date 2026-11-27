import { useState } from "react";
import type { FogState, SceneView } from "@vtt/shared";
import { api } from "./api";
import { Button, CheckField, ErrorText, Panel, useConfirm } from "./ui";

export function FogPanel({ scene, fog }: { scene: SceneView | null; fog: FogState | null }) {
  const confirm = useConfirm();
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

  async function coverAll() {
    const ok = await confirm({
      title: "Cobrir o mapa inteiro?",
      message: "Tudo volta a ficar escondido dos jogadores.",
      confirmLabel: "Cobrir tudo",
    });
    if (ok) void run(() => api.coverAllFog(scene!.id));
  }

  const enabled = fog?.enabled ?? false;
  return (
    <Panel title="Fog" gm>
      <CheckField
        label="Fog ligada: tudo começa escondido"
        gm
        checked={enabled}
        onChange={(e) => void run(() => api.fogEnabled(scene.id, e.target.checked))}
      />
      {enabled ? (
        <>
          <div className="actions">
            <Button size="sm" onClick={() => void run(() => api.undoFog(scene.id))}>
              Desfazer
            </Button>
            <Button size="sm" onClick={() => void run(() => api.revealAllFog(scene.id))}>
              Revelar tudo
            </Button>
            <Button size="sm" variant="gm" onClick={() => void coverAll()}>
              Cobrir tudo
            </Button>
          </div>
          <p className="details">
            Ferramentas de revelar e cobrir ficam na barra do mapa. Você vê a fog em hachura; os
            jogadores veem preto, e token sob fog não chega até eles.
          </p>
        </>
      ) : (
        <p className="details">Fog desligada: os jogadores veem o mapa inteiro.</p>
      )}
      <ErrorText>{error}</ErrorText>
    </Panel>
  );
}
