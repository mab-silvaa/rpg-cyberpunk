import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./icons";

/* Peças do sistema de design "Salandra · Neon Grid". Nada aqui foge dele. */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "gm";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  variant?: Variant;
  /** Preenche o botão de perigo ou de mestre (ação final, como "Expulsar"). */
  solid?: boolean;
  size?: "sm" | "md" | "lg";
  block?: boolean;
  icon?: IconName;
}

/** Botão chanfrado com rótulo em Chakra Petch. Um primário por região. */
export function Button({
  variant = "secondary",
  solid,
  size = "md",
  block,
  icon,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const cls = [
    "btn",
    variant,
    solid ? "solid" : "",
    size === "sm" ? "sm" : size === "lg" ? "lg" : "",
    block ? "block" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={block ? "btn-wrap block" : "btn-wrap"}>
      <button type={type} className={cls} {...rest}>
        {icon && <Icon name={icon} size={size === "lg" ? 19 : 16} />}
        {children}
      </button>
    </span>
  );
}

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  icon: IconName;
  /** Todo botão de ícone tem rótulo. */
  label: string;
  variant?: Variant;
  size?: "sm" | "md";
}

/** Botão chanfrado de 44 × 44 só com ícone. */
export function IconButton({
  icon,
  label,
  variant = "secondary",
  size = "md",
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <span className="btn-wrap">
      <button
        type={type}
        className={`btn icon ${variant} ${size === "sm" ? "sm" : ""}`}
        aria-label={label}
        title={label}
        {...rest}
      >
        <Icon name={icon} size={size === "sm" ? 16 : 20} />
      </button>
    </span>
  );
}

/** Botão quadrado de barra (mapa, listas), com estado ligado/desligado. */
export function ToolButton({
  icon,
  label,
  pressed,
  gm,
  danger,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  icon: IconName;
  label: string;
  pressed?: boolean;
  gm?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={`tool ${gm ? "gm" : ""} ${danger ? "danger" : ""}`}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      {...rest}
    >
      <Icon name={icon} size={22} />
    </button>
  );
}

export type BadgeTone = "muted" | "accent" | "gm" | "turn" | "ok" | "danger";

/** Selo: estado curto, sempre texto + cor. */
export function Badge({
  tone = "muted",
  icon,
  solid,
  children,
}: {
  tone?: BadgeTone;
  icon?: IconName;
  solid?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={`badge ${tone === "muted" ? "" : tone} ${solid ? "solid" : ""}`}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

interface FieldProps {
  label: string;
  error?: string;
  /** Campo com vários botões (como o número com − e +): rótulo não pode ser um <label>. */
  group?: boolean;
  children: ReactNode;
}

/** Rótulo acima, campo de 44 px, erro com ícone e texto. */
export function Field({ label, error, group, children }: FieldProps) {
  const inner = (
    <>
      <span className="t-label">{label}</span>
      {children}
      {error && (
        <span className="field-msg" role="alert">
          <Icon name="alert" size={14} />
          {error}
        </span>
      )}
    </>
  );
  return group ? (
    <div className={`field ${error ? "error" : ""}`} role="group" aria-label={label}>
      {inner}
    </div>
  ) : (
    <label className={`field ${error ? "error" : ""}`}>{inner}</label>
  );
}

export function TextField({
  label,
  error,
  mono,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  label: string;
  error?: string;
  mono?: boolean;
}) {
  return (
    <Field label={label} error={error}>
      <span className={`control ${mono ? "mono" : ""}`}>
        <input {...rest} />
      </span>
    </Field>
  );
}

export function SelectField({
  label,
  children,
  ...rest
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <Field label={label}>
      <span className="control">
        <select {...rest}>{children}</select>
      </span>
    </Field>
  );
}

export function TextArea({
  label,
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> & { label: string }) {
  return (
    <label className="field">
      <span className="t-label">{label}</span>
      <textarea {...rest} />
    </label>
  );
}

/** Caixa de marcar. `gm` pinta de magenta o que só o mestre vê. */
export function CheckField({
  label,
  gm,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "type"> & {
  label: string;
  gm?: boolean;
}) {
  return (
    <label className={`check ${gm ? "gm" : ""}`}>
      <input type="checkbox" {...rest} />
      {label}
    </label>
  );
}

/** Número com − e +, em fonte monoespaçada. */
export function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (n: number) => void;
}) {
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  return (
    <div className="stepper">
      <button
        type="button"
        className="tool"
        aria-label={`Diminuir ${label}`}
        onClick={() => onChange(clamp(value - step))}
      >
        <Icon name="minus" size={16} />
      </button>
      <input
        type="number"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <button
        type="button"
        className="tool"
        aria-label={`Aumentar ${label}`}
        onClick={() => onChange(clamp(value + step))}
      >
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}

/** Faixa de aviso: vermelho = problema, âmbar = atenção, verde = ok. */
export function Alert({
  tone = "danger",
  icon,
  children,
  action,
}: {
  tone?: "danger" | "warn" | "ok";
  icon?: IconName;
  children: ReactNode;
  action?: ReactNode;
}) {
  const name: IconName = icon ?? (tone === "ok" ? "check" : "alert");
  return (
    <div
      className={`alert ${tone === "danger" ? "" : tone}`}
      role={tone === "ok" ? "status" : "alert"}
    >
      <Icon name={name} size={18} />
      <span>{children}</span>
      {action}
    </div>
  );
}

/** Erro de uma ação, com ícone e texto (cor nunca vem sozinha). */
export function ErrorText({ children }: { children?: string }) {
  if (!children) return null;
  return <Alert tone="danger">{children}</Alert>;
}

/** Cartão com chanfro no canto: a moldura de painéis, diálogos e entrada. */
export function Card({
  tone,
  className = "",
  children,
}: {
  tone?: "gm" | "turn" | "danger";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`card ${tone ?? ""} ${className}`}>
      <div className="card-in">{children}</div>
    </div>
  );
}

/** Painel recolhível: marcador (magenta = só do mestre; ciano = de todos), contador e seta. */
export function Panel({
  title,
  gm,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  gm?: boolean;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <Card>
      <h3 style={{ margin: 0 }}>
        <button
          type="button"
          className="panel-head"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          <span className={`panel-mark ${gm ? "gm" : ""}`} />
          {title}
          {count !== undefined && <Badge>{count}</Badge>}
          <span className="panel-chevron">
            <Icon name="chevd" size={20} />
          </span>
        </button>
      </h3>
      {open && (
        <div id={id} className="panel-body">
          {children}
        </div>
      )}
    </Card>
  );
}

export interface TabItem<K extends string> {
  key: K;
  label: string;
  icon: IconName;
}

/** Abas com ícone e rótulo. Magenta marca "só o mestre vê". */
export function Tabs<K extends string>({
  tabs,
  active,
  onChange,
  gm,
  row,
  label,
}: {
  tabs: TabItem<K>[];
  active: K;
  onChange: (key: K) => void;
  gm?: boolean;
  /** Abas em linha (ícone ao lado do rótulo), como nas abas da ficha. */
  row?: boolean;
  label: string;
}) {
  return (
    <div className={`tabs ${gm ? "gm" : ""} ${row ? "row" : ""}`} role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          className="tab"
          aria-selected={active === t.key}
          onClick={() => onChange(t.key)}
        >
          <Icon name={t.icon} size={22} />
          {t.label}
        </button>
      ))}
    </div>
  );
}

export interface MenuItem {
  label: string;
  icon: IconName;
  onSelect: () => void;
  danger?: boolean;
}

/** Menu "mais": ações pouco frequentes, com o perigo separado e em vermelho. */
export function MoreMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [pos, setPos] = useState<{ right: number; top?: number; bottom?: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = pos !== null;

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      const target = e.target as Node | null;
      if (
        e instanceof MouseEvent &&
        target &&
        (wrapRef.current?.contains(target) || menuRef.current?.contains(target))
      ) {
        return;
      }
      setPos(null);
    };
    const onScroll = () => setPos(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  function toggle() {
    if (open) return setPos(null);
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const right = window.innerWidth - rect.right;
    // Sem espaço embaixo: abre para cima. O menu sai do painel (que corta o que passa da borda).
    const below = window.innerHeight - rect.bottom;
    setPos(
      below < items.length * 44 + 24
        ? { right, bottom: window.innerHeight - rect.top + 4 }
        : { right, top: rect.bottom + 4 },
    );
  }

  const normal = items.filter((i) => !i.danger);
  const danger = items.filter((i) => i.danger);
  const pick = (item: MenuItem) => {
    setPos(null);
    item.onSelect();
  };
  return (
    <div className="menu-wrap" ref={wrapRef}>
      <ToolButton
        icon="more"
        label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      />
      {pos &&
        createPortal(
          <div className="menu" role="menu" ref={menuRef} style={pos}>
            {normal.map((i) => (
              <button key={i.label} role="menuitem" type="button" onClick={() => pick(i)}>
                <Icon name={i.icon} size={18} />
                {i.label}
              </button>
            ))}
            {normal.length > 0 && danger.length > 0 && <hr />}
            {danger.map((i) => (
              <button
                key={i.label}
                role="menuitem"
                type="button"
                className="danger"
                onClick={() => pick(i)}
              >
                <Icon name={i.icon} size={18} />
                {i.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

/* ---------- Confirmação (substitui o confirm() do navegador) ---------- */

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel: string;
  /** Ação destrutiva: borda e botão vermelhos. */
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmFn>(() => Promise.resolve(false));

export const useConfirm = (): ConfirmFn => useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{
    options: ConfirmOptions;
    resolve: (ok: boolean) => void;
  } | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  const confirm = useCallback<ConfirmFn>(
    (options) => new Promise((resolve) => setPending({ options, resolve })),
    [],
  );

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  useEffect(() => {
    if (!pending) return;
    // Foco inicial em Cancelar.
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        pending.resolve(false);
        setPending(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pending]);

  const options = pending?.options;
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && close(false)}>
          <div
            className="dialog-box"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <Card tone={options.danger ? "danger" : undefined} className="dialog">
              <div className="dialog-body">
                <h2 id={titleId} className="dialog-title">
                  {options.danger && <Icon name="alert" size={24} />}
                  {options.title}
                </h2>
                {options.message && (
                  <p className="details" style={{ fontSize: 14, lineHeight: "21px" }}>
                    {options.message}
                  </p>
                )}
                <div className="dialog-actions">
                  <span className="btn-wrap">
                    <button
                      ref={cancelRef}
                      type="button"
                      className="btn secondary"
                      onClick={() => close(false)}
                    >
                      Cancelar
                    </button>
                  </span>
                  <Button
                    variant={options.danger ? "danger" : "primary"}
                    solid={options.danger}
                    onClick={() => close(true)}
                  >
                    {options.confirmLabel}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

/* ---------- Confirmação rápida (some em 3 s) ---------- */

export function useToast(): { toast: ReactNode; show: (message: string) => void } {
  const [message, setMessage] = useState<string>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = useCallback((text: string) => {
    setMessage(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(undefined), 3000);
  }, []);
  const toast = message ? (
    <div className="toast">
      <Alert tone="ok">{message}</Alert>
    </div>
  ) : null;
  return { toast, show };
}
