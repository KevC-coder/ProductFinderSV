/**
 * Isotipo ProductFinderSV: "P" geométrica + módulo lima + cuatro esquinas de enfoque.
 *
 * ⚠️ PROVISIONAL: reconstruido a partir de la imagen de referencia. Cuando existan los SVG
 * oficiales, reemplazar este componente (y apps/web/public/favicon.svg) por esos archivos.
 */
export type IsotipoVariant =
  | 'app' // icono de aplicación: cuadrado negro redondeado, P blanca, acentos lima
  | 'auto' // sin fondo: P del color del texto (negra en claro, blanca en oscuro), acentos lima
  | 'on-lime'; // sobre superficie lima: todo en negro

const P_PATH = 'M14 12H28V18H34V24L30 28H21V36H14Z M21 18V22H27V18Z';
const BRACKETS = ['M5 15V5H15', 'M33 5H43V15', 'M5 33V43H15', 'M43 33V43H33'];

export function Isotipo({
  variant = 'auto',
  size = 32,
  className,
  title,
}: {
  variant?: IsotipoVariant;
  size?: number;
  className?: string;
  title?: string;
}) {
  const p = variant === 'app' ? '#ffffff' : variant === 'on-lime' ? '#080a09' : 'currentColor';
  const accent = variant === 'on-lime' ? '#080a09' : '#8ef400';

  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {variant === 'app' && <rect width="48" height="48" rx="11" fill="#080a09" />}
      <g fill="none" stroke={accent} strokeWidth="3.5" strokeLinecap="square">
        {BRACKETS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <path d={P_PATH} fill={p} fillRule="evenodd" />
      <rect x="29.5" y="12" width="4.5" height="4.5" fill={variant === 'on-lime' ? '#080a09' : '#8ef400'} />
    </svg>
  );
}
