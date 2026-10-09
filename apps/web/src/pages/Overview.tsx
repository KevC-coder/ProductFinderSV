import { ArrowRight, Check, LogIn, Plus, SearchCheck } from 'lucide-react';
import { BotStatusCard } from '../components/BotStatusCard';
import { MatchGrid } from '../components/MatchGrid';
import { Button, Card, cx, Dot, PageHeader, PageLoader, SectionTitle, Spinner } from '../components/ui';
import { relativeTime, RUN_STATUS_LABELS, RUN_STATUS_TONE } from '../lib/format';
import { navigate, useConnectSession, useMatches, useRuns, useStatus, useWatcherMap, useWatchers } from '../lib/hooks';

function Stat({ label, value, onClick }: { label: string; value: number | string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="rounded-card border border-border bg-surface p-4 text-left transition-colors duration-200 enabled:hover:border-border-strong"
    >
      <p className="label-tech text-muted">{label}</p>
      <p className="mt-2 font-display text-[32px] leading-none font-bold tracking-[-0.03em] tabular-nums">{value}</p>
    </button>
  );
}

function ViewAll({ to, children }: { to: Parameters<typeof navigate>[0]; children: string }) {
  return (
    <Button size="sm" variant="ghost" onClick={() => navigate(to)}>
      {children} <ArrowRight className="size-3.5" />
    </Button>
  );
}

function Onboarding({ connected, hasWatchers }: { connected: boolean; hasWatchers: boolean }) {
  const connect = useConnectSession();
  const steps = [
    {
      done: connected,
      title: 'Conecta tu cuenta de Facebook',
      text: 'Se abre una ventana de Edge para que inicies sesión. La app no ve ni guarda tu contraseña.',
      action: (
        <Button size="sm" variant="primary" icon={<LogIn className="size-3.5" />} onClick={() => connect.mutate()} loading={connect.isPending}>
          Conectar
        </Button>
      ),
    },
    {
      done: hasWatchers,
      title: 'Crea tu primera búsqueda',
      text: 'El producto, tu rango de precio, el precio ideal y las palabras clave.',
      action: (
        <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => navigate('busquedas')}>
          Crear búsqueda
        </Button>
      ),
    },
  ];
  return (
    <Card className="p-5">
      <p className="label-tech text-muted">Para empezar</p>
      <ol className="mt-4 space-y-4">
        {steps.map((s, i) => (
          <li key={s.title} className="flex items-start gap-3">
            <span
              className={cx(
                'flex size-7 shrink-0 items-center justify-center rounded-md font-mono text-xs font-semibold',
                s.done ? 'bg-lime text-ink' : 'bg-fg text-bg',
              )}
            >
              {s.done ? <Check className="size-4" strokeWidth={3} aria-label="Hecho" /> : String(i + 1).padStart(2, '0')}
            </span>
            <div className="flex-1">
              <p className={cx('text-sm font-semibold', s.done && 'text-muted line-through')}>{s.title}</p>
              {!s.done && <p className="text-[13px] text-muted">{s.text}</p>}
            </div>
            {!s.done && s.action}
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function Overview() {
  const status = useStatus();
  const watchers = useWatchers();
  const runs = useRuns(6);
  const top = useMatches({ status: ['new'], sort: 'score', limit: 8 });
  const byId = useWatcherMap();

  const s = status.data;
  const connected = s?.sessionState === 'connected';
  const hasWatchers = !!watchers.data?.length;

  return (
    <>
      <PageHeader eyebrow="Find / Compare / Filter / Discover" title="Inicio" subtitle="Lo que el bot encontró en Facebook Marketplace para tus búsquedas." />

      <div className="space-y-8">
        <BotStatusCard />
        {s && watchers.data && (!connected || !hasWatchers) && <Onboarding connected={connected} hasWatchers={hasWatchers} />}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Nuevos" value={s?.matches.new ?? '—'} onClick={() => navigate('resultados')} />
          <Stat label="Favoritos" value={s?.matches.favorite ?? '—'} onClick={() => navigate('resultados')} />
          <Stat label="Búsquedas activas" value={s?.activeWatchers ?? '—'} onClick={() => navigate('busquedas')} />
          <Stat label="Vistos" value={s?.matches.seen ?? '—'} />
        </div>

        <section>
          <SectionTitle action={<ViewAll to="resultados">Ver coincidencias</ViewAll>}>Mejores coincidencias nuevas</SectionTitle>
          <p className="-mt-2 mb-4 text-[13px] text-muted">
            Ordenadas por puntuación: precio frente a tu precio ideal, keywords deseables y antigüedad.
          </p>
          {top.isLoading ? (
            <PageLoader />
          ) : top.data?.items.length ? (
            <MatchGrid items={top.data.items} />
          ) : (
            <Card className="flex items-center gap-3 p-5 text-sm text-muted">
              <SearchCheck className="size-5 shrink-0 text-fg" />
              No hay coincidencias nuevas por ahora. El bot seguirá buscando según el horario de cada búsqueda.
            </Card>
          )}
        </section>

        <section>
          <SectionTitle action={<ViewAll to="actividad">Ver actividad</ViewAll>}>Actividad reciente</SectionTitle>
          <Card className="divide-y divide-border">
            {runs.isLoading ? (
              <div className="px-4 py-3">
                <Spinner className="size-4" />
              </div>
            ) : runs.data?.length ? (
              runs.data.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <Dot tone={RUN_STATUS_TONE[r.status]} />
                  <span className="min-w-0 flex-1 truncate font-medium">{byId.get(r.watcherId ?? -1)?.name ?? 'Búsqueda eliminada'}</span>
                  <span className="text-muted">
                    {r.status === 'ok' ? `${r.foundCount} revisadas · ${r.newCount} nuevas` : RUN_STATUS_LABELS[r.status]}
                  </span>
                  <span className="label-tech hidden w-32 text-right text-muted sm:block">{relativeTime(r.startedAt)}</span>
                </div>
              ))
            ) : (
              <p className="px-4 py-3 text-sm text-muted">Todavía no se ha ejecutado ninguna búsqueda.</p>
            )}
          </Card>
        </section>
      </div>

    </>
  );
}
