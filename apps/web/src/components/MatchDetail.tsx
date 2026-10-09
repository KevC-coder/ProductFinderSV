import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatDateTime, formatPrice, relativeTime } from '../lib/format';
import { usePriceHistory } from '../lib/hooks';
import type { Match, Watcher } from '../lib/types';
import { FocusCorners } from './brand/FocusFrame';
import { ListingImage, MatchActions, MatchBadges, priceDropped, SCORE_HELP, ScoreBadge } from './MatchCard';
import { Sparkline } from './Sparkline';
import { Modal, Spinner } from './ui';

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="label-tech mb-2 text-muted">{title}</h3>
      {children}
    </div>
  );
}

/** Detalle de un resultado. Marcarlo como visto al abrirlo lo hace useMatchSelection. */
export function MatchDetail({
  match,
  watcher,
  onClose,
}: {
  match: Match | null;
  watcher: Watcher | undefined;
  onClose: () => void;
}) {
  const history = usePriceHistory(match?.listing.id ?? null);

  const l = match?.listing;
  return (
    <Modal open={!!match} onClose={onClose} wide eyebrow={watcher ? `Coincidencia · ${watcher.name}` : 'Coincidencia'} title={l?.title ?? 'Publicación'}>
      {match && l && (
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div>
            {/* El producto destacado: enmarcado con las esquinas de enfoque. */}
            <div className="relative p-2.5">
              <FocusCorners className="border-lime" size={18} thickness={3} />
              <ListingImage src={l.imageUrl} alt={l.title ?? ''} className="aspect-square w-full rounded-lg" />
            </div>
            <a
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 flex h-11 items-center justify-center gap-2 rounded-lg bg-lime text-sm font-semibold text-ink transition-colors duration-200 hover:bg-lime-hover"
            >
              Ver en Facebook <ExternalLink className="size-4" />
            </a>
          </div>

          <div className="space-y-5">
            <div>
              <div className="flex flex-wrap gap-1">
                <MatchBadges match={match} watcher={watcher} showNew={false} />
              </div>
              <div className="mt-2 flex items-center gap-3">
                <span className="font-display text-4xl font-bold tracking-[-0.03em] tabular-nums">{formatPrice(l.price)}</span>
                {priceDropped(match) && <span className="text-muted tabular-nums line-through">{formatPrice(l.previousPrice)}</span>}
                <ScoreBadge score={match.score} className="ml-auto" />
              </div>
              <p className="mt-1 text-xs text-muted">{SCORE_HELP}</p>
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-sm">
              <dt className="label-tech self-center text-muted">Ubicación</dt>
              <dd>{l.location ?? '—'}</dd>
              <dt className="label-tech self-center text-muted">Publicado</dt>
              <dd title={formatDateTime(l.listedAt)}>{l.listedAt ? relativeTime(l.listedAt) : '—'}</dd>
              <dt className="label-tech self-center text-muted">Vendedor</dt>
              <dd>{l.sellerName ?? '—'}</dd>
              <dt className="label-tech self-center text-muted">Estado</dt>
              <dd>{l.condition ?? '—'}</dd>
              <dt className="label-tech self-center text-muted">Encontrado</dt>
              <dd>{formatDateTime(l.firstSeenAt)}</dd>
            </dl>

            {match.matchedKeywords.length > 0 && (
              <Block title="Keywords encontradas">
                <div className="flex flex-wrap gap-1">
                  {match.matchedKeywords.map((k) => (
                    <span key={k} className="rounded-md bg-lime-soft px-2 py-0.5 text-[13px] font-medium text-lime-ink">
                      {k}
                    </span>
                  ))}
                </div>
              </Block>
            )}

            <Block title="Descripción">
              {l.description ? (
                <p className="max-h-48 overflow-y-auto rounded-lg border border-border bg-bg p-3 text-sm leading-relaxed whitespace-pre-line">
                  {l.description}
                </p>
              ) : (
                <p className="text-sm text-muted">
                  {l.detailFetchedAt ? 'La publicación no tiene descripción.' : 'Aún no se ha revisado. El bot la abrirá en una próxima corrida.'}
                </p>
              )}
            </Block>

            <Block title="Historial de precio">{history.isLoading ? <Spinner /> : <Sparkline points={history.data ?? []} />}</Block>

            <div className="border-t border-border pt-2">
              <MatchActions match={match} compact />
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
