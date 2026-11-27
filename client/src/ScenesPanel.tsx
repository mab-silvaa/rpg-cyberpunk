import { useState, type FormEvent } from "react";
import { GRID_PX_MAX, GRID_PX_MIN, SCENE_NAME_MAX_LENGTH, type SceneSummary } from "@vtt/shared";
import { api } from "./api";
import {
  Badge,
  Button,
  CheckField,
  ErrorText,
  Field,
  MoreMenu,
  Panel,
  Stepper,
  TextField,
  ToolButton,
  useConfirm,
} from "./ui";

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
    <form className="form sub-form" onSubmit={(e) => void submit(e)}>
      <TextField
        label="Nome da cena"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={SCENE_NAME_MAX_LENGTH}
        required
      />
      <TextField
        label={`${initial ? "Trocar a imagem do mapa" : "Imagem do mapa"} (PNG, JPG ou WebP)`}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <div className="form-row">
        <Field label="Quadrado (px)" group>
          <Stepper
            label="Quadrado (px)"
            min={GRID_PX_MIN}
            max={GRID_PX_MAX}
            value={gridPx}
            onChange={setGridPx}
          />
        </Field>
        <Field label="Metros por quadrado" group>
          <Stepper
            label="Metros por quadrado"
            min={0.1}
            max={1000}
            step={0.5}
            value={meters}
            onChange={(n) => setMeters(Math.round(n * 10) / 10)}
          />
        </Field>
      </div>
      <CheckField
        label="Mostrar o grid"
        checked={gridVisible}
        onChange={(e) => setGridVisible(e.target.checked)}
      />
      <ErrorText>{error}</ErrorText>
      <div className="actions">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Salvando..." : submitLabel}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}

export function ScenesPanel({ scenes, onScenes, previewId, onPreview }: Props) {
  const confirm = useConfirm();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
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
    else setCreating(false);
  }

  async function remove(scene: SceneSummary) {
    const ok = await confirm({
      title: `Excluir "${scene.name}"?`,
      message: "A cena e a imagem do mapa são apagadas. Os tokens dela também.",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (ok) void run(() => api.deleteScene(scene.id));
  }

  return (
    <Panel title="Cenas" gm count={scenes.length}>
      {scenes.length === 0 && (
        <p className="details">Nenhuma cena ainda. Crie a primeira abaixo.</p>
      )}
      <ul className="list">
        {scenes.map((scene) => (
          <li key={scene.id}>
            <div className="row">
              <span className="row-name">
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{scene.name}</span>
                {scene.isActive && <Badge tone="ok">Ativa</Badge>}
                {previewId === scene.id && <Badge tone="gm">Prévia</Badge>}
              </span>
              {!scene.isActive && (
                <Button size="sm" onClick={() => void run(() => api.activateScene(scene.id))}>
                  Ativar
                </Button>
              )}
              <ToolButton
                icon="eye"
                label={previewId === scene.id ? "Fechar prévia" : `Ver prévia de ${scene.name}`}
                pressed={previewId === scene.id}
                gm
                onClick={() => onPreview(previewId === scene.id ? null : scene.id)}
              />
              <MoreMenu
                label={`Mais ações de ${scene.name}`}
                items={[
                  {
                    label: "Editar",
                    icon: "note",
                    onSelect: () => setEditingId(editingId === scene.id ? null : scene.id),
                  },
                  {
                    label: "Excluir",
                    icon: "trash",
                    danger: true,
                    onSelect: () => void remove(scene),
                  },
                ]}
              />
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
      <ErrorText>{error}</ErrorText>
      {creating ? (
        <SceneForm
          submitLabel="Criar cena"
          onSubmit={(values) => save(null, values)}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <div className="actions">
          <Button icon="plus" onClick={() => setCreating(true)}>
            Nova cena
          </Button>
        </div>
      )}
    </Panel>
  );
}
