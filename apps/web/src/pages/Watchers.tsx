import { Clock, Pencil, Play, Plus, Search, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useToast } from '../components/Toasts';
import { WatcherForm } from '../components/WatcherForm';
import {
  Badge,
  Button,
  Card,
  CHIP_TONES,
  ConfirmDialog,
  cx,
  Dot,
  EmptyState,
  IconButton,
  PageHeader,
  PageLoader,
  Spinner,
  Toggle,
  type Tone,
} from '../components/ui';
import { formatPrice, plural, relativeTime, RUN_STATUS_LABELS, RUN_STATUS_TONE } from '../lib/format';
import { navigate, useDeleteWatcher, useRunWatcher, useSaveWatcher, useWatchers } from '../lib/hooks';
import type { Watcher, WatcherWithStats } from '../lib/types';

function priceSummary(w: Watcher): string | null {
  if (w.minPrice == null && w.maxPrice == null) return null;
  if (w.minPrice != null && w.maxPrice != null) return `${formatPrice(w.minPrice)} – ${formatPrice(w.maxPrice)}`;
  return w.minPrice != null ? `Desde ${formatPrice(w.minPrice)}` : `Hasta ${formatPrice(w.maxPrice)}`;
}

/** Fila de keywords: obligatorias en negro, deseables en lima suave, excluidas en rojo. */
function KeywordList({ label, words, tone }: { label: string; words: string[]; tone: Tone }) {
  if (!words.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="label-tech mr-1 w-24 shrink-0 !text-[10px] text-muted">{label}</span>
      {words.map((k) => (
        <span key={k} className={cx('rounded px-1.5 py-0.5 text-xs font-medium', CHIP_TONES[tone])}>
          {k}
        </span>
      ))}
    </div>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="label-tech !text-[10px] text-muted">{label}</p>
      <div className="mt-1 flex items-center gap-1.5">{children}</div>
    </div>
  );
}

function WatcherCard({
  w,
  onEdit,
  onDelete,
}: {
  w: WatcherWithStats;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const save = useSaveWatcher();
  const run = useRunWatcher();
  const toast = useToast();
  const price = priceSummary(w);
  const busy = run.isPending || w.queued;

  const runNow = () =>
    run.mutate(w.id, {
      onSuccess: (s) => {
        if (s.status !== 'ok') return; // los errores llegan por el evento en vivo
        const n = s.newMatchIds.length;
        toast({
          tone: n ? 'success' : 'info',
          title: n ? `${plural(n, 'resultado')} ${n === 1 ? 'nuevo' : 'nuevos'}` : 'Sin resultados nuevos',
          body: `Se revisaron ${s.foundCount} publicaciones${s.detailsFetched ? ` y ${s.detailsFetched} descripciones` : ''}.`,
        });
      },
    });

  return (
    <Card className={cx('p-5', !w.active && 'bg-bg')}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold tracking-[-0.01em]">{w.name}</h2>
            {!w.active && <Badge>Pausada</Badge>}
            {w.consecutiveFailures > 0 && <Badge tone="danger">{w.consecutiveFailures} errores seguidos</Badge>}
          </div>
          <p className="mt-0.5 text-sm text-muted">
            Busca <span className="font-semibold text-fg">“{w.query}”</span>
            {price && <> · {price}</>}
            {w.idealPrice != null && (
              <>
                {' '}
                · ideal <span className="font-semibold text-fg">{formatPrice(w.idealPrice)}</span>
              </>
            )}
          </p>
        </div>
        <Toggle
          checked={w.active}
          onChange={(active) => save.mutate({ id: w.id, data: { active } })}
          ariaLabel={`Búsqueda “${w.name}” activa`}
        />
      </div>

      <div className="mt-4 space-y-1.5">
        <KeywordList label={w.mustMode === 'all' ? 'Debe tener' : 'Alguna de'} words={w.mustKeywords} tone="inverse" />
        <KeywordList label="Suma puntos" words={w.bonusKeywords} tone="brand" />
        <KeywordList label="Descarta" words={w.excludeKeywords} tone="danger" />
      </div>

      <div className="mt-4 grid gap-3 rounded-lg border border-border bg-bg p-3 text-[13px] sm:grid-cols-3">
        <Meta label="Horario">
          {w.runsPerDay} veces/día · {w.windowStart}–{w.windowEnd}
        </Meta>
        <Meta label="Próxima búsqueda">
          {busy ? (
            <>
              <Spinner className="size-3.5" /> Buscando…
            </>
          ) : w.active && w.nextRunAt ? (
            <>
              <Clock className="size-3.5 text-muted" /> {relativeTime(w.nextRunAt)}
            </>
          ) : (
            '—'
          )}
        </Meta>
        <Meta label="Última">
          {w.lastRun ? (
            <span className="flex items-center gap-1.5" title={w.lastRun.errorMessage ?? undefined}>
              <Dot tone={RUN_STATUS_TONE[w.lastRun.status]} />
              {relativeTime(w.lastRun.finishedAt)} ·{' '}
              {w.lastRun.status === 'ok' ? `${w.lastRun.newCount} nuevos` : RUN_STATUS_LABELS[w.lastRun.status]}
            </span>
          ) : (
            <span className="text-muted">Nunca</span>
          )}
        </Meta>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" icon={<Play className="size-3.5" />} onClick={runNow} loading={busy}>
          Probar ahora
        </Button>
        <Button size="sm" onClick={() => navigate('resultados', { watcher: w.id })}>
          Ver coincidencias
          {w.matches.new > 0 && <Badge tone="inverse">{w.matches.new} nuevos</Badge>}
        </Button>
        <div className="ml-auto flex">
          <IconButton label="Editar" onClick={onEdit}>
            <Pencil className="size-4" />
          </IconButton>
          <IconButton label="Eliminar" onClick={onDelete} className="hover:text-danger">
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </div>
    </Card>
  );
}

export function Watchers() {
  const watchers = useWatchers();
  const remove = useDeleteWatcher();
  const [editing, setEditing] = useState<Watcher | null | 'new'>(null);
  const [deleting, setDeleting] = useState<Watcher | null>(null);

  return (
    <>
      <PageHeader
        eyebrow="Criterios"
        title="Búsquedas"
        subtitle="Define qué producto buscar, a qué precio y cada cuánto."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            Nueva búsqueda
          </Button>
        }
      />

      {watchers.isLoading ? (
        <PageLoader />
      ) : !watchers.data?.length ? (
        <EmptyState icon={<Search />} title="¿Qué producto quieres encontrar?">
          <p>Crea una búsqueda con el producto, tu rango de precio y las palabras clave. Por ejemplo: “iphone 13”, de $150 a $350, que diga “liberado”.</p>
          <Button variant="primary" className="mt-4" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            Crear la primera
          </Button>
        </EmptyState>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {watchers.data.map((w) => (
            <WatcherCard
              key={w.id}
              w={w}
              onEdit={() => setEditing(w)}
              onDelete={() => setDeleting(w)}
            />
          ))}
        </div>
      )}

      {/* La key reinicia el formulario al abrir otra búsqueda. */}
      {editing !== null && (
        <WatcherForm
          key={editing === 'new' ? 'new' : editing.id}
          watcher={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        title="Eliminar búsqueda"
        message={
          <>
            Se eliminará <strong className="text-fg">“{deleting?.name}”</strong> junto con sus resultados e historial. Esta acción no
            se puede deshacer.
          </>
        }
        confirmLabel="Eliminar"
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      />
    </>
  );
}
