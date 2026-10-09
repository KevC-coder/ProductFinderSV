import { useMatchSelection, useWatcherMap } from '../lib/hooks';
import type { Match } from '../lib/types';
import { MatchCard } from './MatchCard';
import { MatchDetail } from './MatchDetail';

/** Cuadrícula de resultados con su vista de detalle (Inicio y Resultados). */
export function MatchGrid({ items, showWatcherName = true }: { items: Match[]; showWatcherName?: boolean }) {
  const watchers = useWatcherMap();
  const { selected, open, close } = useMatchSelection(items);

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
        {items.map((m) => (
          <MatchCard
            key={m.id}
            match={m}
            watcher={watchers.get(m.watcherId)}
            showWatcherName={showWatcherName}
            onOpen={() => open(m)}
          />
        ))}
      </div>
      <MatchDetail match={selected} watcher={selected ? watchers.get(selected.watcherId) : undefined} onClose={close} />
    </>
  );
}
