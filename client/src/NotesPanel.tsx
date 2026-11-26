import { useEffect, useRef, useState } from "react";
import { NOTE_BODY_MAX_LENGTH, NOTE_TITLE_MAX_LENGTH, type Note } from "@vtt/shared";
import { api } from "./api";
import { Markdown } from "./Markdown";

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
    <div className="note-editor">
      <div className="row">
        <input
          aria-label="Título da nota"
          value={title}
          maxLength={NOTE_TITLE_MAX_LENGTH}
          onChange={(e) => {
            setTitle(e.target.value);
            change({ title: e.target.value, body });
          }}
        />
        <button onClick={() => setPreview(!preview)}>{preview ? "Editar" : "Ver formatado"}</button>
        <span className={`save-state save-${status === "salva" ? "salvo" : status}`} role="status">
          {status === "salva" ? "Salva" : status === "salvando" ? "Salvando..." : "Não salvou"}
        </span>
      </div>
      {preview ? (
        <Markdown source={body} />
      ) : (
        <textarea
          aria-label="Texto da nota"
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
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Notas privadas do mestre, em Markdown, com autosave. */
export function NotesPanel() {
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
    if (!window.confirm(`Apagar a nota "${note.title}"?`)) return;
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
    <>
      <h3>Notas do mestre</h3>
      <p className="details">Só você vê. Escritas em Markdown.</p>
      <button onClick={() => void create()}>Nova nota</button>
      <ul className="scenes notes">
        {notes.map((note) => (
          <li key={note.id} className={selectedId === note.id ? "selected" : ""}>
            <div className="scene-line">
              <button
                className="link token-name"
                onClick={() => setSelectedId(selectedId === note.id ? null : note.id)}
              >
                {note.title}
              </button>
              <button className="link danger" onClick={() => void remove(note)}>
                Apagar
              </button>
            </div>
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
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
