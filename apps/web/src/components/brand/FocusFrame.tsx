import type { ReactNode } from 'react';
import { cx } from '../ui';

/**
 * Cuatro esquinas de enfoque (recurso de marca). El contenedor padre debe ser `relative`.
 * Úsalas con moderación: dato o producto destacado, hover de tarjeta, estados de carga.
 */
export function FocusCorners({
  className,
  size = 12,
  thickness = 2,
  inset = 0,
}: {
  /** Color y visibilidad, p. ej. "border-lime" o "border-lime opacity-0 group-hover:opacity-100". */
  className?: string;
  size?: number;
  thickness?: number;
  inset?: number;
}) {
  const base = 'pointer-events-none absolute transition-opacity duration-200';
  const s = { width: size, height: size };
  return (
    <span aria-hidden className="contents">
      <span className={cx(base, className)} style={{ ...s, top: inset, left: inset, borderTopWidth: thickness, borderLeftWidth: thickness }} />
      <span className={cx(base, className)} style={{ ...s, top: inset, right: inset, borderTopWidth: thickness, borderRightWidth: thickness }} />
      <span className={cx(base, className)} style={{ ...s, bottom: inset, left: inset, borderBottomWidth: thickness, borderLeftWidth: thickness }} />
      <span className={cx(base, className)} style={{ ...s, bottom: inset, right: inset, borderBottomWidth: thickness, borderRightWidth: thickness }} />
    </span>
  );
}

/** Contenido rodeado de esquinas de enfoque, con un pequeño margen. */
export function FocusFrame({
  children,
  className,
  cornerClassName = 'border-lime',
  size = 12,
}: {
  children: ReactNode;
  className?: string;
  cornerClassName?: string;
  size?: number;
}) {
  return (
    <div className={cx('relative p-2', className)}>
      <FocusCorners className={cornerClassName} size={size} />
      {children}
    </div>
  );
}

/** Estado de carga de marca: esquinas de enfoque con una línea de escaneo. */
export function ScanLoader({ label = 'Cargando', className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cx('flex flex-col items-center gap-3', className)}>
      <div className="relative size-11 overflow-hidden">
        <FocusCorners className="border-fg" size={11} />
        <span className="absolute inset-x-1.5 top-0 h-full animate-[pf-scan_1.1s_ease-in-out_infinite_alternate]">
          <span className="block h-0.5 w-full bg-lime" />
        </span>
      </div>
      <span className="label-tech text-muted">{label}</span>
    </div>
  );
}
