import { SearchX } from 'lucide-react';
import { useState } from 'react';
import { MatchGrid } from '../components/MatchGrid';
import { Button, EmptyState, NumberInput, PageHeader, PageLoader, Segmented, Select, Spinner } from '../components/ui';
import { navigate, useMatches, useWatchers } from '../lib/hooks';
import type { MatchFilter, MatchStatus } from '../lib/types';

const PAGE = 48;

const STATUS_TABS: { label: string; value: MatchStatus[] | undefined }[] = [
  { label: 'Pendientes', value: ['new', 'seen', 'favorite'] },
  { label: 'Nuevos', value: ['new'] },
  { label: 'Favoritos', value: ['favorite'] },
  { label: 'Descartados', value: ['dismissed'] },
];

function emptyMessage(hasWatchers: boolean, filtered: boolean): string {
  if (!hasWatchers) return 'Crea tu primera búsqueda en la pestaña Búsquedas.';
  if (filtered) return 'Prueba ampliar el rango de precio o cambiar a la pestaña Pendientes.';
  return 'Cuando el bot encuentre publicaciones que cumplan tus criterios aparecerán aquí. Si tarda, revisa las keywords excluidas de tus búsquedas.';
}

export function Results({ params }: { params: URLSearchParams }) {
  const watchers = useWatchers();

  const watcherId = params.get('watcher') ? Number(params.get('watcher')) : undefined;
  const [tab, setTab] = useState(0);
  const [sort, setSort] = useState<NonNullable<MatchFilter['sort']>>('score');
  const [minPrice, setMinPrice] = useState<number | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [includeDuplicates, setIncludeDuplicates] = useState(false);

  const filter: MatchFilter = {
    watcherId,
    status: STATUS_TABS[tab]!.value,
    sort,
    minPrice: minPrice ?? undefined,
    maxPrice: maxPrice ?? undefined,
    includeDuplicates,
  };
  // "Ver más" amplía el límite solo mientras no cambie ningún filtro.
  const filterKey = JSON.stringify(filter);
  const [paging, setPaging] = useState({ key: filterKey, limit: PAGE });
  const limit = paging.key === filterKey ? paging.limit : PAGE;

  const matches = useMatches({ ...filter, limit });
  const items = matches.data?.items ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Coincidencias"
        title="Resultados"
        subtitle={matches.data ? `${matches.data.total} publicaciones cumplen tus criterios` : undefined}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Segmented
          label="Estado"
          options={STATUS_TABS.map((t, i) => ({ label: t.label, value: i }))}
          value={tab}
          onChange={setTab}
        />

        <Select
          aria-label="Búsqueda"
          value={watcherId ?? ''}
          onChange={(e) => navigate('resultados', e.target.value ? { watcher: e.target.value } : undefined)}
          className="w-auto min-w-40"
        >
          <option value="">Todas las búsquedas</option>
          {watchers.data?.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Ordenar"
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="w-auto"
        >
          <option value="score">Mejor puntuación</option>
          <option value="newest">Más recientes</option>
          <option value="price">Menor precio</option>
        </Select>

        <div className="flex items-center gap-1.5">
          <div className="w-24">
            <NumberInput aria-label="Precio mínimo" placeholder="Mín $" value={minPrice} onChange={setMinPrice} min={0} />
          </div>
          <span className="text-muted">–</span>
          <div className="w-24">
            <NumberInput aria-label="Precio máximo" placeholder="Máx $" value={maxPrice} onChange={setMaxPrice} min={0} />
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted">
          <input
            type="checkbox"
            checked={includeDuplicates}
            onChange={(e) => setIncludeDuplicates(e.target.checked)}
            className="size-4 accent-[var(--color-fg)]"
          />
          Mostrar republicaciones
        </label>
        {matches.isFetching && <Spinner className="size-4" />}
      </div>

      {matches.isLoading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState icon={<SearchX />} title="Sin coincidencias con estos filtros">
          {emptyMessage(!!watchers.data?.length, minPrice != null || maxPrice != null || tab !== 0)}
        </EmptyState>
      ) : (
        <>
          <MatchGrid items={items} showWatcherName={!watcherId} />
          {matches.data && matches.data.total > items.length && (
            <div className="mt-6 flex justify-center">
              <Button onClick={() => setPaging({ key: filterKey, limit: limit + PAGE })} loading={matches.isFetching}>
                Ver más ({matches.data.total - items.length} restantes)
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
