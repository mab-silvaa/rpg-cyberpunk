import { useEffect, useRef, useState, type DragEvent } from "react";
import type { ImageInfo } from "@vtt/shared";
import { uploadImageWithProgress } from "./api";
import { Icon } from "./icons";
import { Button, IconButton, useConfirm } from "./ui";

type Phase = "idle" | "uploading" | "ready" | "error";

const ACCEPT = "image/png,image/jpeg,image/webp";
const ERROR_TEXT = "O arquivo é grande demais ou não é uma imagem aceita (PNG, JPG ou WebP).";

interface Props {
  /** "map" = zona 310 × 220; "token" = zona quadrada de 150 px. */
  kind: "map" | "token";
  /** Título da zona: "Enviar imagem do mapa" / "Imagem do token". */
  title: string;
  /** Imagem que já existe (edição); mostra o estado Pronto. */
  currentUrl?: string | null;
  /** Forma do token para recortar a prévia: círculo (jogador) ou hexágono (NPC). */
  shape?: "circle" | "hex";
  disabled?: boolean;
  /** Por que está desativado. */
  disabledText?: string;
  /** Texto de "Solte para enviar" no estado de arrasto. */
  replaceText?: string;
  /** id da imagem enviada; null quando o usuário remove. */
  onChange: (image: ImageInfo | null) => void;
  /** Avisa o formulário para segurar o envio enquanto a imagem sobe. */
  onBusy?: (busy: boolean) => void;
}

/** Zona de envio de imagem do sistema de design (prancha 13 · Envio de arquivo). */
export function FileDrop({
  kind,
  title,
  currentUrl,
  shape = "circle",
  disabled,
  disabledText,
  replaceText,
  onChange,
  onBusy,
}: Props) {
  const confirm = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const job = useRef<{ cancel: () => void } | undefined>(undefined);
  const lastFile = useRef<File | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>(currentUrl ? "ready" : "idle");
  const [name, setName] = useState(currentUrl ? "Imagem atual" : "");
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [percent, setPercent] = useState(0);
  const [over, setOver] = useState(false);

  useEffect(() => () => job.current?.cancel(), []);
  useEffect(() => onBusy?.(phase === "uploading"), [phase, onBusy]);

  function start(file: File) {
    lastFile.current = file;
    setName(file.name);
    setPercent(0);
    setPhase("uploading");
    const upload = uploadImageWithProgress(file, setPercent);
    job.current = upload;
    upload.promise.then(
      (image) => {
        job.current = undefined;
        setPreview(image.url);
        setPhase("ready");
        onChange(image);
      },
      (e: unknown) => {
        job.current = undefined;
        // Cancelado pelo usuário volta ao estado anterior sem mostrar erro.
        if (e instanceof Error && e.message === "Envio cancelado") return;
        setPhase("error");
      },
    );
  }

  function cancel() {
    job.current?.cancel();
    job.current = undefined;
    setPhase(preview ? "ready" : "idle");
  }

  async function remove() {
    const ok = await confirm({
      title: "Remover a imagem?",
      message: "A imagem sai deste formulário. Você pode enviar outra depois.",
      confirmLabel: "Remover",
    });
    if (!ok) return;
    setPreview(null);
    setName("");
    setPhase("idle");
    onChange(null);
  }

  function pick() {
    if (!disabled) input.current?.click();
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setOver(false);
    const file = event.dataTransfer.files[0];
    if (file && !disabled) start(file);
  }

  const cls = `drop ${kind}`;
  const hidden = (
    <input
      ref={input}
      type="file"
      accept={ACCEPT}
      hidden
      tabIndex={-1}
      aria-label={title}
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file) start(file);
      }}
    />
  );

  if (disabled) {
    return (
      <div className={`${cls} is-disabled`} aria-disabled="true">
        <Icon name={kind === "map" ? "upload" : "image"} size={30} />
        <span className="drop-title">{title}</span>
        {disabledText && <span className="drop-hint">{disabledText}</span>}
      </div>
    );
  }

  if (phase === "uploading") {
    return (
      <div className={`${cls} is-busy`} role="status" aria-live="polite">
        <div className="drop-file">
          <Icon name="image" size={22} />
          <div className="drop-meta">
            <span className="drop-name">{name}</span>
            <span className="drop-hint">Enviando…</span>
          </div>
          <span className="drop-pct t-mono">{percent} %</span>
        </div>
        <div
          className="drop-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
        <Button size="sm" onClick={cancel}>
          Cancelar
        </Button>
      </div>
    );
  }

  if (phase === "ready") {
    return (
      <div className={`${cls} is-ready`}>
        {preview && (
          <span className={`drop-preview ${shape}`}>
            <img src={preview} alt="" />
          </span>
        )}
        <div className="drop-meta">
          <span className="drop-name">{name}</span>
          <span className="drop-ok">
            <Icon name="check" size={14} /> Pronto
          </span>
        </div>
        <div className="actions">
          <Button size="sm" onClick={pick}>
            Trocar
          </Button>
          <IconButton
            icon="trash"
            size="sm"
            variant="ghost"
            label="Remover imagem"
            onClick={() => void remove()}
          />
        </div>
        {hidden}
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className={`${cls} is-error`} role="alert">
        <Icon name="alert" size={24} />
        <span className="drop-title">Não foi possível enviar</span>
        <span className="drop-hint">{ERROR_TEXT}</span>
        <Button
          size="sm"
          icon="refresh"
          onClick={() => {
            if (lastFile.current) start(lastFile.current);
            else pick();
          }}
        >
          Tentar de novo
        </Button>
        {hidden}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`${cls} is-zone${over ? " is-over" : ""}`}
      onClick={pick}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <Icon name={kind === "map" ? "upload" : "image"} size={over ? 34 : 30} />
      {over ? (
        <>
          <span className="drop-title accent">
            {kind === "map" ? "Solte para enviar" : "Solte aqui"}
          </span>
          {replaceText && <span className="drop-hint">{replaceText}</span>}
        </>
      ) : (
        <>
          <span className="drop-title">{title}</span>
          {kind === "map" && (
            <>
              <span className="drop-hint only-pc">Arraste aqui ou escolha um arquivo</span>
              <span className="drop-hint only-mobile">Toque para escolher uma imagem</span>
              <span className="drop-fmt">PNG, JPG ou WebP</span>
              <span className="drop-cta">
                <span className="only-pc">Escolher arquivo</span>
                <span className="only-mobile">Escolher imagem</span>
              </span>
            </>
          )}
        </>
      )}
      {hidden}
    </button>
  );
}
