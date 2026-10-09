import { History } from 'lucide-react';
import { Badge, Card, EmptyState, PageHeader, PageLoader } from '../components/ui';
import { durationSeconds, formatDateTime, RUN_STATUS_LABELS, RUN_STATUS_TONE } from '../lib/format';
import { useRuns, useWatcherMap } from '../lib/hooks';

export function Activity() {
  const runs = useRuns(200);
  const watchers = useWatcherMap();

  return (
    <>
      <PageHeader eyebrow="Registro" title="Actividad" subtitle="Cada vez que el bot buscó en Marketplace: cuánto revisó, qué encontró y cuánto tardó." />
      {runs.isLoading ? (
        <PageLoader />
      ) : !runs.data?.length ? (
        <EmptyState icon={<History />} title="Sin actividad todavía">Cuando el bot ejecute una búsqueda, quedará registrada aquí.</EmptyState>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="label-tech px-4 py-3 font-medium text-muted">Fecha</th>
                <th className="label-tech px-4 py-3 font-medium text-muted">Búsqueda</th>
                <th className="label-tech px-4 py-3 font-medium text-muted">Estado</th>
                <th className="label-tech px-4 py-3 text-right font-medium text-muted">Revisadas</th>
                <th className="label-tech px-4 py-3 text-right font-medium text-muted">Nuevas</th>
                <th className="label-tech px-4 py-3 text-right font-medium text-muted">Descripciones</th>
                <th className="label-tech px-4 py-3 text-right font-medium text-muted">Duración</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {runs.data.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap text-muted">{formatDateTime(r.startedAt)}</td>
                  <td className="px-4 py-2.5">{watchers.get(r.watcherId ?? -1)?.name ?? <span className="text-muted">Eliminada</span>}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={RUN_STATUS_TONE[r.status]}>{RUN_STATUS_LABELS[r.status]}</Badge>
                    {r.errorMessage && <p className="mt-1 max-w-xs text-xs text-muted">{r.errorMessage}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.foundCount}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.newCount}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.detailsFetched}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap text-muted">{durationSeconds(r.startedAt, r.finishedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
