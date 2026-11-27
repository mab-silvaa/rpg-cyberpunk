import { useState, type FormEvent } from "react";
import {
  TOKEN_NAME_MAX_LENGTH,
  TOKEN_SIZE_MAX,
  TOKEN_SIZE_MIN,
  type CharacterView,
  type PresenceUser,
  type SceneView,
  type TokenInput,
  type TokenView,
} from "@vtt/shared";
import { api } from "./api";
import { Icon } from "./icons";
import {
  Badge,
  Button,
  CheckField,
  ErrorText,
  Field,
  MoreMenu,
  Panel,
  SelectField,
  Stepper,
  TextField,
  useConfirm,
} from "./ui";

interface Props {
  scene: SceneView | null;
  tokens: TokenView[];
  players: PresenceUser[];
  characters: CharacterView[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onChange: (token: TokenView) => void;
  onRemove: (id: number) => void;
}

interface FormValues {
  name: string;
  size: number;
  color: string;
  ownerId: number | null;
  characterId: number | null;
  hidden: boolean;
  file: File | null;
  removeImage: boolean;
}

/** As oito cores de dono de token do sistema de design (luminosidades diferentes). */
const OWNER_COLORS: { hex: string; name: string }[] = [
  { hex: "#22e5ff", name: "Ciano" },
  { hex: "#ffc61a", name: "Âmbar" },
  { hex: "#7cf28b", name: "Verde" },
  { hex: "#b197ff", name: "Violeta" },
  { hex: "#ff8a3d", name: "Laranja" },
  { hex: "#f2f5ff", name: "Branco" },
  { hex: "#4d8bff", name: "Azul" },
  { hex: "#ff7ac8", name: "Rosa" },
];

function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div className="field" role="radiogroup" aria-label="Cor do token">
      <span className="t-label">Cor do dono</span>
      <div className="actions" style={{ gap: 8 }}>
        {OWNER_COLORS.map((c) => {
          const on = value.toLowerCase() === c.hex;
          return (
            <button
              key={c.hex}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={c.name}
              title={c.name}
              className="swatch-btn"
              style={{ background: c.hex }}
              onClick={() => onChange(c.hex)}
            >
              {on && <Icon name="check" size={20} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TokenForm({
  initial,
  players,
  characters,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: TokenView;
  players: PresenceUser[];
  characters: CharacterView[];
  submitLabel: string;
  onSubmit: (values: FormValues) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [size, setSize] = useState(initial?.size ?? 1);
  const [color, setColor] = useState(initial?.color ?? OWNER_COLORS[0]!.hex);
  const [ownerId, setOwnerId] = useState<number | null>(initial?.ownerId ?? null);
  const [characterId, setCharacterId] = useState<number | null>(initial?.characterId ?? null);
  const [hidden, setHidden] = useState(initial?.hidden ?? false);
  const [file, setFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await onSubmit({ name, size, color, ownerId, characterId, hidden, file, removeImage });
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
        label="Nome do token"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={TOKEN_NAME_MAX_LENGTH}
        required
      />
      <Field label="Tamanho (quadrados)" group>
        <Stepper
          label="Tamanho (quadrados)"
          min={TOKEN_SIZE_MIN}
          max={TOKEN_SIZE_MAX}
          step={0.5}
          value={size}
          onChange={setSize}
        />
      </Field>
      <ColorPicker value={color} onChange={setColor} />
      <SelectField
        label="Quem move"
        value={ownerId ?? ""}
        onChange={(e) => setOwnerId(e.target.value === "" ? null : Number(e.target.value))}
      >
        <option value="">Só o mestre (NPC)</option>
        {players
          .filter((p) => !p.isGm)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
      </SelectField>
      <SelectField
        label="Ficha ligada (mostra a barra de HP no token)"
        value={characterId ?? ""}
        onChange={(e) => setCharacterId(e.target.value === "" ? null : Number(e.target.value))}
      >
        <option value="">Nenhuma</option>
        {characters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.data.handle || "Sem nome"}
            {c.ownerId === null ? " (NPC)" : ""}
          </option>
        ))}
      </SelectField>
      <TextField
        label={`${initial?.imageUrl ? "Trocar a imagem" : "Imagem (opcional)"} (PNG, JPG ou WebP)`}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      {initial?.imageUrl && !file && (
        <CheckField
          label="Remover a imagem (volta a mostrar as iniciais)"
          checked={removeImage}
          onChange={(e) => setRemoveImage(e.target.checked)}
        />
      )}
      <CheckField
        label="Escondido dos jogadores"
        gm
        checked={hidden}
        onChange={(e) => setHidden(e.target.checked)}
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

export function TokensPanel({
  scene,
  tokens,
  players,
  characters,
  selectedId,
  onSelect,
  onChange,
  onRemove,
}: Props) {
  const confirm = useConfirm();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>();

  async function save(id: number | null, values: FormValues) {
    const imageId = values.file
      ? (await api.uploadImage(values.file)).id
      : values.removeImage
        ? null
        : undefined;
    const input: TokenInput = {
      name: values.name,
      size: values.size,
      color: values.color,
      ownerId: values.ownerId,
      characterId: values.characterId,
      hidden: values.hidden,
      ...(imageId !== undefined ? { imageId } : {}),
    };
    if (id === null) {
      const created = await api.createToken({ ...input, sceneId: scene!.id });
      onChange(created);
      onSelect(created.id);
      setCreating(false);
    } else {
      onChange(await api.updateToken(id, input));
      setEditingId(null);
    }
  }

  async function remove(token: TokenView) {
    const ok = await confirm({
      title: `Excluir "${token.name}"?`,
      message: "O token sai do mapa agora.",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;
    setError(undefined);
    try {
      await api.deleteToken(token.id);
      onRemove(token.id);
      if (selectedId === token.id) onSelect(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo deu errado");
    }
  }

  const ownerName = (token: TokenView): string | undefined =>
    players.find((p) => p.id === token.ownerId)?.name;

  return (
    <Panel title="Tokens da cena" gm count={tokens.length}>
      {!scene && <p className="details">Crie uma cena para poder colocar tokens nela.</p>}
      {scene && tokens.length === 0 && (
        <p className="details">Nenhum token nesta cena. Crie o primeiro abaixo.</p>
      )}
      <ul className="list">
        {tokens.map((token) => (
          <li key={token.id}>
            <div className={`row ${selectedId === token.id ? "selected" : ""}`}>
              <span className="row-name">
                <button
                  type="button"
                  aria-pressed={selectedId === token.id}
                  onClick={() => onSelect(selectedId === token.id ? null : token.id)}
                >
                  <span className="swatch" style={{ background: token.color }} />
                  {token.name}
                </button>
                {token.hidden && (
                  <Badge tone="gm" icon="eyeoff">
                    Oculto
                  </Badge>
                )}
                {ownerName(token) && <Badge tone="accent">{ownerName(token)}</Badge>}
                {token.ownerId === null && <Badge>NPC</Badge>}
              </span>
              <MoreMenu
                label={`Mais ações de ${token.name}`}
                items={[
                  {
                    label: "Editar",
                    icon: "note",
                    onSelect: () => setEditingId(editingId === token.id ? null : token.id),
                  },
                  {
                    label: "Excluir",
                    icon: "trash",
                    danger: true,
                    onSelect: () => void remove(token),
                  },
                ]}
              />
            </div>
            {editingId === token.id && (
              <TokenForm
                initial={token}
                players={players}
                characters={characters}
                submitLabel="Salvar"
                onSubmit={(values) => save(token.id, values)}
                onCancel={() => setEditingId(null)}
              />
            )}
          </li>
        ))}
      </ul>
      <ErrorText>{error}</ErrorText>
      {scene &&
        (creating ? (
          <>
            <p className="details">
              O token aparece no centro do mapa; arraste para o lugar certo.
            </p>
            <TokenForm
              players={players}
              characters={characters}
              submitLabel="Criar token"
              onSubmit={(v) => save(null, v)}
              onCancel={() => setCreating(false)}
            />
          </>
        ) : (
          <div className="actions">
            <Button icon="plus" onClick={() => setCreating(true)}>
              Novo token
            </Button>
          </div>
        ))}
    </Panel>
  );
}
