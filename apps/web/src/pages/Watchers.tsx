import { Clock, Download, Pencil, Play, Plus, Search, Trash2, Upload } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
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
import { api } from '../lib/api';
import { navigate, useDeleteWatcher, useImportWatchers, useRunWatcher, useSaveWatcher, useWatchers } from '../lib/hooks';
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

/** Descarga las búsquedas como archivo JSON para compartirlas con amigos. */
async function downloadExport(): Promise<number> {
  const data = await api.exportWatchers();
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  // Fecha local (AAAA-MM-DD), no la UTC de exportedAt.
  a.download = `productfindersv-busquedas-${new Date().toLocaleDateString('en-CA')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return data.watchers.length;
}

/** Botones Importar / Exportar: compartir búsquedas entre instalaciones (solo criterios, sin resultados). */
function ShareActions({ canExport }: { canExport: boolean }) {
  const toast = useToast();
  const importer = useImportWatchers();
  const [exporting, setExporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      toast({ tone: 'error', title: 'No se pudo leer el archivo', body: 'Elige un archivo .json exportado desde ProductFinderSV.' });
      return;
    }
    importer.mutate(data, {
      onSuccess: ({ imported }) =>
        toast({
          tone: 'success',
          title: `${plural(imported, 'búsqueda')} ${imported === 1 ? 'importada' : 'importadas'}`,
          body: 'Revisa precios y horarios antes de que el bot las ejecute.',
        }),
      onError: (e) => toast({ tone: 'error', title: 'No se pudo importar', body: e.message }),
    });
  };

  const onExport = async () => {
    setExporting(true);
    try {
      const n = await downloadExport();
      toast({ tone: 'success', title: `${plural(n, 'búsqueda')} ${n === 1 ? 'exportada' : 'exportadas'}`, body: 'El archivo está en tu carpeta de descargas.' });
    } catch (e) {
      toast({ tone: 'error', title: 'No se pudo exportar', body: (e as Error).message });
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = ''; // permite volver a elegir el mismo archivo
        }}
      />
      <Button icon={<Upload className="size-4" />} onClick={() => fileInput.current?.click()} loading={importer.isPending}>
        Importar
      </Button>
      {canExport && (
        <Button icon={<Download className="size-4" />} onClick={() => void onExport()} loading={exporting}>
          Exportar
        </Button>
      )}
    </>
  );
}

export function Watchers({ params }: { params: URLSearchParams }) {
  const watchers = useWatchers();
  const remove = useDeleteWatcher();
  // ?nueva=1 abre el formulario directamente (desde Inicio, "Crear búsqueda").
  const [editing, setEditing] = useState<Watcher | null | 'new'>(params.has('nueva') ? 'new' : null);
  const [deleting, setDeleting] = useState<Watcher | null>(null);

  const closeForm = () => {
    setEditing(null);
    if (params.has('nueva')) navigate('busquedas');
  };

  return (
    <>
      <PageHeader
        eyebrow="Criterios"
        title="Búsquedas"
        subtitle="Define qué producto buscar, a qué precio y cada cuánto."
        actions={
          <>
            <ShareActions canExport={!!watchers.data?.length} />
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
              Nueva búsqueda
            </Button>
          </>
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
          <p className="mt-3 text-xs">¿Un amigo te compartió sus búsquedas? Usa “Importar” con su archivo .json.</p>
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
          onClose={closeForm}
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
