import { Check, ExternalLink, EyeOff, ImageOff, RotateCcw, Star, TrendingDown } from 'lucide-react';
import { useState } from 'react';
import { formatPrice, relativeTime } from '../lib/format';
import { useSetMatchStatus } from '../lib/hooks';
import { isDescriptionPending } from '../lib/matches';
import type { Match, Watcher } from '../lib/types';
import { FocusCorners } from './brand/FocusFrame';
import { Badge, cx, IconButton } from './ui';

export const SCORE_HELP =
  'Puntuación de 0 a 100: precio respecto a tu precio ideal, keywords deseables encontradas y qué tan reciente es la publicación.';

export function priceDropped(m: Match): boolean {
  const l = m.listing;
  return !!l.priceDroppedAt && l.previousPrice != null && l.price != null && l.price < l.previousPrice;
}

/** Lima solo para las coincidencias más altas; negro para las buenas; neutro el resto. */
export function scoreTone(score: number) {
  return score >= 75 ? 'bg-lime text-ink' : score >= 50 ? 'bg-fg text-bg' : 'bg-surface-2 text-muted';
}

export function ScoreBadge({ score, className }: { score: number; className?: string }) {
  return (
    <span title={SCORE_HELP} className={cx('label-tech rounded-md px-1.5 py-1 tabular-nums !tracking-[0.06em]', scoreTone(score), className)}>
      {score}
      <span className="opacity-60">/100</span>
    </span>
  );
}

/** Foto de producto: proporción estable, object-contain y contenedor claro (también en modo oscuro). */
export function ListingImage({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={cx('flex items-center justify-center bg-photo text-[#69706b]', className)}>
        <ImageOff className="size-6" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cx('bg-photo object-contain', className)}
    />
  );
}

/** Acciones rápidas sobre un resultado: favorito, visto, descartar, abrir en Facebook. */
export function MatchActions({ match, compact }: { match: Match; compact?: boolean }) {
  const setStatus = useSetMatchStatus();
  const set = (status: Match['status']) => setStatus.mutate({ id: match.id, status });
  const fav = match.status === 'favorite';

  return (
    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      <IconButton label={fav ? 'Quitar de favoritos' : 'Agregar a favoritos'} active={fav} onClick={() => set(fav ? 'seen' : 'favorite')}>
        <Star className={cx('size-4', fav && 'fill-lime stroke-fg')} />
      </IconButton>
      {match.status === 'new' && (
        <IconButton label="Marcar como visto" onClick={() => set('seen')}>
          <Check className="size-4" />
        </IconButton>
      )}
      {match.status !== 'dismissed' ? (
        <IconButton label="Descartar" onClick={() => set('dismissed')}>
          <EyeOff className="size-4" />
        </IconButton>
      ) : (
        <IconButton label="Restaurar" onClick={() => set('seen')}>
          <RotateCcw className="size-4" />
        </IconButton>
      )}
      {!compact && (
        <a
          href={match.listing.url}
          target="_blank"
          rel="noreferrer"
          title="Ver en Facebook"
          aria-label="Ver en Facebook"
          onClick={() => match.status === 'new' && set('seen')}
          className="ml-auto inline-flex size-9 items-center justify-center rounded-lg text-muted transition-colors duration-200 hover:bg-surface-2 hover:text-fg"
        >
          <ExternalLink className="size-4" />
        </a>
      )}
    </div>
  );
}

export function MatchBadges({
  match,
  watcher,
  showNew = true,
}: {
  match: Match;
  watcher: Watcher | undefined;
  showNew?: boolean;
}) {
  return (
    <>
      {showNew && match.status === 'new' && <Badge tone="inverse">Nuevo</Badge>}
      {match.isIdealPrice && (
        <Badge tone="brand">
          <Check className="size-3" strokeWidth={3} />
          Precio ideal
        </Badge>
      )}
      {priceDropped(match) && (
        <Badge tone="warning">
          <TrendingDown className="size-3" />
          Bajó de precio
        </Badge>
      )}
      {match.listing.isPending && <Badge>Reservado</Badge>}
      {isDescriptionPending(match, watcher) && <Badge>Descripción sin revisar</Badge>}
    </>
  );
}

export function MatchCard({
  match,
  watcher,
  showWatcherName,
  onOpen,
}: {
  match: Match;
  watcher: Watcher | undefined;
  showWatcherName: boolean;
  onOpen: () => void;
}) {
  const l = match.listing;
  const dimmed = match.status === 'dismissed';

  return (
    <article
      className={cx(
        'group flex flex-col overflow-hidden rounded-card border border-border bg-surface transition-colors duration-200 hover:border-border-strong/40',
        dimmed && 'opacity-60',
      )}
    >
      <button type="button" onClick={onOpen} className="relative block text-left" aria-label={`Ver detalle de ${l.title ?? 'publicación'}`}>
        <ListingImage src={l.imageUrl} alt={l.title ?? ''} className="aspect-[4/3] w-full" />
        {/* Hover: un solo efecto, las esquinas de enfoque sobre la foto. */}
        <FocusCorners className="border-lime opacity-0 group-hover:opacity-100" size={16} thickness={3} inset={8} />
        <ScoreBadge score={match.score} className="absolute top-2 left-2" />
      </button>

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="flex min-h-5 flex-wrap gap-1">
          <MatchBadges match={match} watcher={watcher} />
        </div>
        <button type="button" onClick={onOpen} className="text-left">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-xl font-bold tracking-[-0.02em] tabular-nums">{formatPrice(l.price)}</span>
            {priceDropped(match) && (
              <span className="text-sm text-muted tabular-nums line-through">{formatPrice(l.previousPrice)}</span>
            )}
          </div>
          <h3 className="mt-0.5 line-clamp-2 font-sans text-sm leading-snug">{l.title ?? 'Sin título'}</h3>
        </button>
        <p className="mt-auto truncate text-xs text-muted">
          {[l.location, relativeTime(l.listedAt ?? l.firstSeenAt)].filter(Boolean).join(' · ')}
          {showWatcherName && watcher && <> · {watcher.name}</>}
        </p>
        <div className="-mx-1.5 -mb-1.5 border-t border-border pt-1">
          <MatchActions match={match} />
        </div>
      </div>
    </article>
  );
}
