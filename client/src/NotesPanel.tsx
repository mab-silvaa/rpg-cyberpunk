import { useEffect, useRef, useState } from "react";
import { NOTE_BODY_MAX_LENGTH, NOTE_TITLE_MAX_LENGTH, type Note } from "@vtt/shared";
import { api } from "./api";
import { Markdown } from "./Markdown";
import { Badge, Button, ErrorText, MoreMenu, Panel, TextArea, TextField, useConfirm } from "./ui";

const SAVE_DELAY_MS = 800;

function Editor({ note, onSaved }: { note: Note; onSaved: (note: Note) => void }) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [preview, setPreview] = useState(false);
  const [status, setStatus] = useState<"salva" | "salvando" | "erro">("salva");
  const [error, setError] = useState<string>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef({ title, body });

  useEffect(() => () => clearTimeout(timer.current), []);

  function change(next: { title: string; body: string }) {
    latest.current = next;
    setStatus("salvando");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const sent = latest.current;
      try {
        // O título vazio não é aceito: espera o mestre escrever algo.
        if (!sent.title.trim()) return setStatus("erro");
        onSaved(await api.updateNote(note.id, sent));
        setError(undefined);
        setStatus("salva");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não consegui salvar");
        setStatus("erro");
      }
    }, SAVE_DELAY_MS);
  }

  return (
    <div className="form sub-form">
      <TextField
        label="Título da nota"
        value={title}
        maxLength={NOTE_TITLE_MAX_LENGTH}
        onChange={(e) => {
          setTitle(e.target.value);
          change({ title: e.target.value, body });
        }}
      />
      <div className="actions">
        <Button size="sm" icon={preview ? "note" : "eye"} onClick={() => setPreview(!preview)}>
          {preview ? "Editar" : "Ver formatado"}
        </Button>
        <span role="status">
          {status === "salva" ? (
            <Badge tone="ok" icon="check">
              Salva
            </Badge>
          ) : status === "salvando" ? (
            <Badge tone="accent" icon="refresh">
              Salvando...
            </Badge>
          ) : (
            <Badge tone="danger" icon="alert">
              Não salvou
            </Badge>
          )}
        </span>
      </div>
      {preview ? (
        <Markdown source={body} />
      ) : (
        <TextArea
          label="Texto da nota"
          rows={10}
          value={body}
          maxLength={NOTE_BODY_MAX_LENGTH}
          placeholder="Escreva em Markdown: # título, **negrito**, *itálico*, - lista"
          onChange={(e) => {
            setBody(e.target.value);
            change({ title, body: e.target.value });
          }}
        />
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

/** Notas privadas do mestre, em Markdown, com autosave. */
export function NotesPanel() {
  const confirm = useConfirm();
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void api.notes().then(setNotes, () => setError("Não consegui carregar as notas"));
  }, []);

  async function create() {
    setError(undefined);
    try {
      const note = await api.createNote({ title: "Nova nota" });
      setNotes((list) => [note, ...list]);
      setSelectedId(note.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo deu errado");
    }
  }

  async function remove(note: Note) {
    const ok = await confirm({
      title: `Apagar "${note.title}"?`,
      message: "A nota some para sempre.",
      confirmLabel: "Apagar",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteNote(note.id);
      setNotes((list) => list.filter((n) => n.id !== note.id));
      if (selectedId === note.id) setSelectedId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo deu errado");
    }
  }

  const selected = notes.find((n) => n.id === selectedId);
  return (
    <Panel title="Notas do mestre" gm count={notes.length}>
      <p className="details">Só você vê. Escritas em Markdown.</p>
      <div className="actions">
        <Button icon="plus" onClick={() => void create()}>
          Nova nota
        </Button>
      </div>
      <ul className="list">
        {notes.map((note) => (
          <li key={note.id} className={`row ${selectedId === note.id ? "selected" : ""}`}>
            <span className="row-name">
              <button
                type="button"
                aria-pressed={selectedId === note.id}
                onClick={() => setSelectedId(selectedId === note.id ? null : note.id)}
              >
                {note.title}
              </button>
            </span>
            <MoreMenu
              label={`Mais ações de ${note.title}`}
              items={[
                { label: "Apagar", icon: "trash", danger: true, onSelect: () => void remove(note) },
              ]}
            />
          </li>
        ))}
      </ul>
      {notes.length === 0 && <p className="details">Nenhuma nota ainda.</p>}
      {selected && (
        <Editor
          key={selected.id}
          note={selected}
          onSaved={(saved) => setNotes((list) => list.map((n) => (n.id === saved.id ? saved : n)))}
        />
      )}
      <ErrorText>{error}</ErrorText>
    </Panel>
  );
}
