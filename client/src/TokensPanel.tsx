import { useState, type FormEvent } from "react";
import {
  TOKEN_DEFAULT_COLOR,
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
  const [color, setColor] = useState(initial?.color ?? TOKEN_DEFAULT_COLOR);
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
    <form className="scene-form" onSubmit={(e) => void submit(e)}>
      <label>
        Nome do token
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={TOKEN_NAME_MAX_LENGTH}
          required
        />
      </label>
      <div className="row">
        <label>
          Tamanho (quadrados)
          <input
            type="number"
            min={TOKEN_SIZE_MIN}
            max={TOKEN_SIZE_MAX}
            step={0.5}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            required
          />
        </label>
        <label>
          Cor
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
      </div>
      <label>
        Quem move
        <select
          value={ownerId ?? ""}
          onChange={(e) => setOwnerId(e.target.value === "" ? null : Number(e.target.value))}
        >
          <option value="">Só o mestre</option>
          {players
            .filter((p) => !p.isGm)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        Ficha ligada (mostra a barra de HP no token)
        <select
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
        </select>
      </label>
      <label>
        {initial?.imageUrl ? "Trocar a imagem" : "Imagem (opcional)"} (PNG, JPG ou WebP)
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      {initial?.imageUrl && !file && (
        <label className="check">
          <input
            type="checkbox"
            checked={removeImage}
            onChange={(e) => setRemoveImage(e.target.checked)}
          />
          Remover a imagem (volta a mostrar as iniciais)
        </label>
      )}
      <label className="check">
        <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
        Escondido dos jogadores
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
  const [editingId, setEditingId] = useState<number | null>(null);
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
    } else {
      onChange(await api.updateToken(id, input));
      setEditingId(null);
    }
  }

  async function remove(token: TokenView) {
    if (!window.confirm(`Excluir o token "${token.name}"?`)) return;
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
    <>
      <h3>Tokens{scene ? ` de "${scene.name}"` : ""}</h3>
      {!scene && <p className="details">Crie uma cena para poder colocar tokens nela.</p>}
      {scene && tokens.length === 0 && (
        <p className="details">Nenhum token nesta cena. Crie o primeiro abaixo.</p>
      )}
      <ul className="scenes tokens">
        {tokens.map((token) => (
          <li key={token.id} className={selectedId === token.id ? "selected" : ""}>
            <div className="scene-line">
              <button
                className="link token-name"
                onClick={() => onSelect(selectedId === token.id ? null : token.id)}
              >
                <span className="swatch" style={{ background: token.color }} />
                {token.name}
                {token.hidden && <strong className="badge preview">oculto</strong>}
                {ownerName(token) && <strong className="badge">{ownerName(token)}</strong>}
              </button>
              <span className="actions">
                <button
                  className="link"
                  onClick={() => setEditingId(editingId === token.id ? null : token.id)}
                >
                  Editar
                </button>
                <button className="link danger" onClick={() => void remove(token)}>
                  Excluir
                </button>
              </span>
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
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {scene && (
        <details className="new-scene">
          <summary>Novo token</summary>
          <p className="details">O token aparece no centro do mapa; arraste para o lugar certo.</p>
          <TokenForm
            players={players}
            characters={characters}
            submitLabel="Criar token"
            onSubmit={(v) => save(null, v)}
          />
        </details>
      )}
    </>
  );
}
