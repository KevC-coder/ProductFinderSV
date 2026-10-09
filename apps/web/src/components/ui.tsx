import { Loader2, X } from 'lucide-react';
import { useEffect, useId, useRef, type ComponentProps, type ReactNode } from 'react';
import { FocusCorners, ScanLoader } from './brand/FocusFrame';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ---- Botón ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'on-dark';
const VARIANTS: Record<ButtonVariant, string> = {
  // Lima + texto negro: la acción principal de cada pantalla.
  primary: 'bg-lime text-ink hover:bg-lime-hover',
  secondary: 'bg-surface border border-border text-fg hover:border-border-strong',
  ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
  danger: 'bg-danger text-white hover:opacity-90',
  // Secundario sobre paneles oscuros.
  'on-dark': 'border border-white/25 text-white hover:border-white',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  icon,
  children,
  className,
  disabled,
  ...rest
}: ComponentProps<'button'> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors duration-200',
        'disabled:cursor-not-allowed disabled:opacity-45',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-sm',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  active,
  className,
  ...rest
}: ComponentProps<'button'> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cx(
        'inline-flex size-9 items-center justify-center rounded-lg text-muted transition-colors duration-200 hover:bg-surface-2 hover:text-fg',
        active && 'text-fg',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ---- Insignias ------------------------------------------------------------------------

/**
 * brand = lima (mejor coincidencia / precio ideal) · inverse = negro (nuevo, seleccionado).
 * Los semánticos siempre llevan texto; el color nunca es la única señal.
 */
export type Tone = 'neutral' | 'brand' | 'inverse' | 'success' | 'warning' | 'danger';
const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted',
  brand: 'bg-lime text-ink',
  inverse: 'bg-fg text-bg',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

/** Chips de palabras clave y etiquetas: fondo suave con el texto del tono. */
export const CHIP_TONES: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-fg',
  brand: 'bg-lime-soft text-lime-ink',
  inverse: 'bg-fg text-bg',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx('label-tech inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 !text-[10px]', TONES[tone], className)}>
      {children}
    </span>
  );
}

export function Dot({ tone }: { tone: Tone }) {
  const color: Record<Tone, string> = {
    neutral: 'bg-muted',
    brand: 'bg-lime',
    inverse: 'bg-fg',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
  };
  return <span className={cx('inline-block size-2 shrink-0', color[tone])} />;
}

// ---- Contenedores ---------------------------------------------------------------------

export function Card({ children, className, ...rest }: ComponentProps<'div'>) {
  return (
    <div className={cx('rounded-card border border-border bg-surface', className)} {...rest}>
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="label-tech mb-2 text-muted">{eyebrow}</p>}
        <h1 className="text-[28px] leading-tight font-bold tracking-[-0.02em] md:text-[32px]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Título de sección con microetiqueta opcional. */
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold tracking-[-0.01em]">{children}</h2>
      {action}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <Card className="bg-grid flex flex-col items-center px-6 py-14 text-center">
      <div className="relative mb-4 flex size-16 items-center justify-center bg-surface text-fg [&>svg]:size-7">
        <FocusCorners className="border-lime" size={12} />
        {icon}
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
    </Card>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-5 animate-spin text-muted', className)} />;
}

/** Carga de página completa con el recurso de escaneo de marca. */
export function PageLoader() {
  return (
    <div className="flex justify-center py-24">
      <ScanLoader />
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{children}</p>;
}

// ---- Formularios ----------------------------------------------------------------------

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: (id: string) => ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold">
        {label}
      </label>
      {children(id)}
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

const inputBase =
  'rounded-lg border border-border bg-surface px-3 text-sm text-fg transition-colors duration-200 placeholder:text-muted/80 hover:border-muted focus:border-border-strong focus:outline-none';

export function Input({ className, ...rest }: ComponentProps<'input'>) {
  return <input className={cx(inputBase, 'h-10 w-full', className)} {...rest} />;
}

/** Ancho completo por defecto; pasar className con un ancho (w-auto, w-44…) para cambiarlo. */
export function Select({ className, children, ...rest }: ComponentProps<'select'>) {
  return (
    <select className={cx(inputBase, 'h-10 pr-8', className ?? 'w-full')} {...rest}>
      {children}
    </select>
  );
}

/** Campo numérico que acepta vacío (null). */
export function NumberInput({
  value,
  onChange,
  suffix,
  ...rest
}: Omit<ComponentProps<'input'>, 'value' | 'onChange'> & {
  value: number | null;
  onChange: (v: number | null) => void;
  suffix?: string;
}) {
  return (
    <div className="relative">
      <Input
        type="number"
        inputMode="decimal"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className={cx('tabular-nums', suffix && 'pr-14')}
        {...rest}
      />
      {suffix && (
        <span className="label-tech pointer-events-none absolute inset-y-0 right-3 flex items-center !text-[10px] text-muted">
          {suffix}
        </span>
      )}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  ariaLabel,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  /** Nombre accesible cuando el interruptor se muestra sin etiqueta visible. */
  ariaLabel?: string;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  const sw = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 disabled:opacity-50',
        checked ? 'border-lime bg-lime' : 'border-border bg-surface-2',
      )}
    >
      <span
        className={cx(
          'inline-block size-4 rounded-full transition-transform duration-200',
          checked ? 'translate-x-[22px] bg-ink' : 'translate-x-[3px] bg-muted',
        )}
      />
    </button>
  );
  if (!label) return sw;
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="cursor-pointer">
        <span className="block text-sm font-semibold">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </label>
      {sw}
    </div>
  );
}

/** Pestañas segmentadas: la seleccionada va en negro (lima en modo oscuro). */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex rounded-lg border border-border bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'h-8 rounded-md px-3 text-[13px] font-semibold transition-colors duration-200',
            value === o.value ? 'bg-selected text-selected-fg' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---- Modal ----------------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx(
        'm-auto max-h-[90vh] w-[calc(100%-2rem)] overflow-hidden rounded-panel border border-border bg-surface p-0 text-fg shadow-xl backdrop:bg-ink/50',
        wide ? 'max-w-3xl' : 'max-w-lg',
      )}
    >
      {open && (
        <div className="flex max-h-[90vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
            <div className="min-w-0">
              {eyebrow && <p className="label-tech mb-1 text-muted">{eyebrow}</p>}
              <h2 className="text-lg leading-snug font-semibold">{title}</h2>
            </div>
            <IconButton label="Cerrar" onClick={onClose} className="-mr-2">
              <X className="size-4" />
            </IconButton>
          </div>
          <div className="overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-border px-6 py-3.5">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  loading,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button onClick={onCancel}>Cancelar</Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-muted">{message}</div>
    </Modal>
  );
}
