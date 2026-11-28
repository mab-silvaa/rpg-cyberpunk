import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { NAME_MAX_LENGTH, NAME_MIN_LENGTH } from "@vtt/shared";
import { Icon } from "./icons";
import { Button, Card, TextField } from "./ui";

/** Diálogo "Mudar meu nome" (prancha 09). No celular vira folha que sobe da base. */
export function RenameDialog({
  name,
  onSave,
  onClose,
}: {
  name: string;
  /** Salva o nome; rejeita com a mensagem do erro. */
  onSave: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const trimmed = value.trim();
  const changed = trimmed !== name && trimmed.length > 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (!trimmed) return setError("O nome não pode ficar vazio.");
    if (trimmed.length < NAME_MIN_LENGTH) {
      return setError(`Use pelo menos ${NAME_MIN_LENGTH} caracteres.`);
    }
    if (trimmed === name) return onClose();
    setSaving(true);
    setError(undefined);
    try {
      await onSave(trimmed);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo deu errado");
      setSaving(false);
    }
  }

  return (
    <div
      className="scrim sheet"
      onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}
    >
      <form
        className="dialog-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={(e) => void submit(e)}
      >
        <Card tone={error ? "danger" : undefined} className="dialog">
          <div className="dialog-body">
            <h2 id={titleId} className="dialog-title">
              {error && <Icon name="alert" size={24} />}
              Mudar meu nome
            </h2>
            <p className="details" style={{ fontSize: 14, lineHeight: "21px" }}>
              É o nome que aparece no mapa, na iniciativa e nas rolagens.
            </p>
            <TextField
              ref={input}
              label="Novo nome"
              value={value}
              maxLength={NAME_MAX_LENGTH}
              disabled={saving}
              error={error}
              hint={`${NAME_MIN_LENGTH} a ${NAME_MAX_LENGTH} caracteres. Todos veem o novo nome na hora.`}
              onChange={(e) => {
                setValue(e.target.value);
                setError(undefined);
              }}
            />
            <div className="dialog-actions">
              <span className="btn-wrap">
                <button type="button" className="btn secondary" disabled={saving} onClick={onClose}>
                  Cancelar
                </button>
              </span>
              <Button
                type="submit"
                variant="primary"
                disabled={saving || (!changed && !error)}
                icon={saving ? "refresh" : undefined}
              >
                {saving ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </div>
        </Card>
      </form>
    </div>
  );
}
