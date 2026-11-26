import { useState, type FormEvent } from "react";
import { GRID_PX_MAX, GRID_PX_MIN, SCENE_NAME_MAX_LENGTH, type SceneSummary } from "@vtt/shared";
import { api } from "./api";

interface Props {
  scenes: SceneSummary[];
  onScenes: (scenes: SceneSummary[]) => void;
  previewId: number | null;
  onPreview: (id: number | null) => void;
}

interface FormValues {
  name: string;
  gridPx: number;
  metersPerSquare: number;
  gridVisible: boolean;
  file: File | null;
}

function SceneForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: SceneSummary;
  submitLabel: string;
  onSubmit: (values: FormValues) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [gridPx, setGridPx] = useState(initial?.gridPx ?? 70);
  const [meters, setMeters] = useState(initial?.metersPerSquare ?? 2);
  const [gridVisible, setGridVisible] = useState(initial?.gridVisible ?? true);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await onSubmit({ name, gridPx, metersPerSquare: meters, gridVisible, file });
      if (!initial) {
        setName("");
        setFile(null);
        (event.target as HTMLFormElement).reset();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo deu errado");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="scene-form" onSubmit={(e) => void submit(e)}>
      <label>
        Nome da cena
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={SCENE_NAME_MAX_LENGTH}
          required
        />
      </label>
      <label>
        {initial ? "Trocar a imagem do mapa" : "Imagem do mapa"} (PNG, JPG ou WebP)
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      <div className="row">
        <label>
          Quadrado (px)
          <input
            type="number"
            min={GRID_PX_MIN}
            max={GRID_PX_MAX}
            step={1}
            value={gridPx}
            onChange={(e) => setGridPx(Number(e.target.value))}
            required
          />
        </label>
        <label>
          Metros por quadrado
          <input
            type="number"
            min={0.1}
            max={1000}
            step={0.1}
            value={meters}
            onChange={(e) => setMeters(Number(e.target.value))}
            required
          />
        </label>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={gridVisible}
          onChange={(e) => setGridVisible(e.target.checked)}
        />
        Mostrar o grid
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button type="submit" disabled={busy}>
          {busy ? "Salvando..." : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="link" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

export function ScenesPanel({ scenes, onScenes, previewId, onPreview }: Props) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string>();

  async function run(action: () => Promise<SceneSummary[]>) {
    setError(undefined);
    try {
      const list = await action();
      onScenes(list);
      // Cena apagada que estava em prévia: volta para a ativa.
      if (previewId !== null && !list.some((s) => s.id === previewId)) onPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo deu errado");
    }
  }

  async function save(id: number | null, values: FormValues) {
    const imageId = values.file ? (await api.uploadImage(values.file)).id : undefined;
    const input = {
      name: values.name,
      gridPx: values.gridPx,
      metersPerSquare: values.metersPerSquare,
      gridVisible: values.gridVisible,
      ...(imageId !== undefined ? { imageId } : {}),
    };
    onScenes(id === null ? await api.createScene(input) : await api.updateScene(id, input));
    if (id !== null) setEditingId(null);
  }

  return (
    <>
      <h3>Cenas</h3>
      {scenes.length === 0 && (
        <p className="details">Nenhuma cena ainda. Crie a primeira abaixo.</p>
      )}
      <ul className="scenes">
        {scenes.map((scene) => (
          <li key={scene.id}>
            <div className="scene-line">
              <span>
                {scene.name}
                {scene.isActive && <strong className="badge">ativa</strong>}
                {previewId === scene.id && <strong className="badge preview">prévia</strong>}
              </span>
              <span className="actions">
                {!scene.isActive && (
                  <button
                    className="link"
                    onClick={() => void run(() => api.activateScene(scene.id))}
                  >
                    Ativar
                  </button>
                )}
                <button
                  className="link"
                  onClick={() => onPreview(previewId === scene.id ? null : scene.id)}
                >
                  {previewId === scene.id ? "Fechar prévia" : "Ver"}
                </button>
                <button
                  className="link"
                  onClick={() => setEditingId(editingId === scene.id ? null : scene.id)}
                >
                  Editar
                </button>
                <button
                  className="link danger"
                  onClick={() => {
                    if (window.confirm(`Excluir a cena "${scene.name}" e a imagem dela?`)) {
                      void run(() => api.deleteScene(scene.id));
                    }
                  }}
                >
                  Excluir
                </button>
              </span>
            </div>
            {editingId === scene.id && (
              <SceneForm
                initial={scene}
                submitLabel="Salvar"
                onSubmit={(values) => save(scene.id, values)}
                onCancel={() => setEditingId(null)}
              />
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <details className="new-scene">
        <summary>Nova cena</summary>
        <SceneForm submitLabel="Criar cena" onSubmit={(values) => save(null, values)} />
      </details>
    </>
  );
}
