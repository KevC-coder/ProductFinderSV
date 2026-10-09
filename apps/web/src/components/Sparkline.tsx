import { formatDateTime, formatPrice } from '../lib/format';

/** Historial de precio en escalones: línea en color de texto, último punto en lima. */
export function Sparkline({ points }: { points: { price: number; seenAt: string }[] }) {
  if (points.length < 2) {
    return <p className="text-sm text-muted">Sin cambios de precio desde que se encontró.</p>;
  }
  const W = 320;
  const H = 72;
  const P = 6;
  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const t0 = Date.parse(points[0]!.seenAt);
  const tSpan = Date.parse(points.at(-1)!.seenAt) - t0 || 1;
  const xy = points.map((p) => [
    P + ((Date.parse(p.seenAt) - t0) / tSpan) * (W - 2 * P),
    P + (1 - (p.price - min) / span) * (H - 2 * P),
  ]);
  // Escalones: el precio se mantiene hasta el siguiente cambio.
  const d = xy.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `H${x}V${y}`)).join('');
  const first = points[0]!;
  const last = points.at(-1)!;
  const diff = last.price - first.price;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="bg-grid h-[72px] w-full text-fg" role="img" aria-label="Historial de precio">
        <path d={d} fill="none" stroke="currentColor" strokeWidth="1.75" />
        {xy.map(([x, y], i) => (
          <rect
            key={i}
            x={x! - 3.5}
            y={y! - 3.5}
            width="7"
            height="7"
            className={i === xy.length - 1 ? 'fill-lime stroke-ink' : 'fill-surface stroke-current'}
            strokeWidth="1.5"
          >
            <title>{`${formatPrice(points[i]!.price)} · ${formatDateTime(points[i]!.seenAt)}`}</title>
          </rect>
        ))}
      </svg>
      <div className="label-tech mt-1.5 flex justify-between text-muted">
        <span>{formatPrice(first.price)}</span>
        <span className={diff < 0 ? 'text-success' : undefined}>
          {formatPrice(last.price)}
          {diff !== 0 && ` (${diff < 0 ? '−' : '+'}${formatPrice(Math.abs(diff))})`}
        </span>
      </div>
    </div>
  );
}
