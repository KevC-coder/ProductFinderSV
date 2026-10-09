import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useToast, type ToastInput } from '../components/Toasts';
import { api } from './api';
import { plural } from './format';
import type {
  Match,
  MatchFilter,
  MatchStatus,
  RunSummary,
  SessionState,
  WatcherInput,
  WatcherWithStats,
} from './types';

// ---- Consultas ------------------------------------------------------------------------

export const useStatus = () => useQuery({ queryKey: ['status'], queryFn: api.status, refetchInterval: 30_000 });
export const useWatchers = () => useQuery({ queryKey: ['watchers'], queryFn: api.watchers, refetchInterval: 60_000 });
export const useRuns = (limit = 100) => useQuery({ queryKey: ['runs', limit], queryFn: () => api.runs(limit) });
export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: api.settings });
export const useMatches = (f: MatchFilter) =>
  useQuery({ queryKey: ['matches', f], queryFn: () => api.matches(f), placeholderData: keepPreviousData });
export const usePriceHistory = (listingId: string | null) =>
  useQuery({
    queryKey: ['priceHistory', listingId],
    queryFn: () => api.priceHistory(listingId!),
    enabled: !!listingId,
  });

const toWatcherMap = (list: WatcherWithStats[]) => new Map(list.map((w) => [w.id, w]));

/** Búsquedas indexadas por id (para mostrar nombres y reglas junto a resultados y corridas). */
export function useWatcherMap(): Map<number, WatcherWithStats> {
  const { data } = useQuery({ queryKey: ['watchers'], queryFn: api.watchers, select: toWatcherMap });
  return data ?? new Map();
}

// ---- Acciones -------------------------------------------------------------------------

export function useSetMatchStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: MatchStatus }) => api.setMatchStatus(id, status),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['matches'] });
      void qc.invalidateQueries({ queryKey: ['status'] });
      void qc.invalidateQueries({ queryKey: ['watchers'] });
    },
  });
}

/**
 * Resultado abierto en el detalle. Abrirlo lo marca como visto, y se guarda una copia porque
 * al dejar de ser "nuevo" puede salir del filtro actual (y el detalle se cerraría solo).
 */
export function useMatchSelection(items: Match[] | undefined) {
  const [snapshot, setSnapshot] = useState<Match | null>(null);
  const setStatus = useSetMatchStatus();
  return {
    selected: items?.find((m) => m.id === snapshot?.id) ?? snapshot,
    open: (m: Match) => {
      setSnapshot(m);
      if (m.status === 'new') setStatus.mutate({ id: m.id, status: 'seen' });
    },
    close: () => setSnapshot(null),
  };
}

export function useSaveWatcher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: number; data: Partial<WatcherInput> }) =>
      id ? api.updateWatcher(id, data) : api.createWatcher(data as WatcherInput),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['watchers'] });
      void qc.invalidateQueries({ queryKey: ['status'] });
    },
  });
}

export function useDeleteWatcher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteWatcher,
    onSuccess: () => void qc.invalidateQueries(),
  });
}

export function useRunWatcher() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: api.runWatcher,
    onMutate: () => void qc.invalidateQueries({ queryKey: ['watchers'] }),
    onError: (err) => toast({ tone: 'error', title: 'No se pudo ejecutar la búsqueda', body: err.message }),
  });
}

/** Importa un archivo de búsquedas exportado (desde esta app o la de un amigo). */
export function useImportWatchers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.importWatchers,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['watchers'] });
      void qc.invalidateQueries({ queryKey: ['status'] });
    },
  });
}

/** Inicio automático con Windows (solo en la app de escritorio). */
export function useAutostart(enabled: boolean) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['autostart'], queryFn: api.autostart, enabled });
  const update = useMutation({
    mutationFn: api.setAutostart,
    onSuccess: (saved) => qc.setQueryData(['autostart'], saved),
  });
  return { query, update };
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Parameters<typeof api.updateSettings>[0]) => api.updateSettings(patch),
    onSuccess: (saved) => {
      qc.setQueryData(['settings'], saved);
      void qc.invalidateQueries({ queryKey: ['status'] });
    },
  });
}

/** Quita la pausa automática por verificación de Facebook. */
export function useResume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.resume,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['status'] });
      void qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}

export function useConnectSession() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: api.connectSession,
    onSuccess: () => {
      toast({
        tone: 'info',
        title: 'Se abrió una ventana de Microsoft Edge',
        body: 'Inicia sesión en Facebook ahí. La app no ve ni guarda tu contraseña.',
      });
      void qc.invalidateQueries({ queryKey: ['status'] });
    },
    onError: (err) => toast({ tone: 'error', title: 'No se pudo abrir el login', body: err.message }),
  });
}

// ---- Eventos en vivo (SSE) ------------------------------------------------------------

const SESSION_TOASTS: Partial<Record<SessionState, ToastInput>> = {
  connected: { tone: 'success', title: 'Facebook conectado' },
  checkpoint: {
    tone: 'error',
    title: 'Facebook pidió una verificación',
    body: 'El bot se pausó. Abre Facebook, resuelve la verificación y luego quita la pausa en Ajustes.',
  },
  logged_out: { tone: 'error', title: 'Se cerró la sesión de Facebook' },
};

/** Escucha /api/events y refresca los datos; avisa con un toast cuando hay resultados nuevos. */
export function useLiveEvents() {
  const qc = useQueryClient();
  const toast = useToast();
  const [connected, setConnected] = useState(true);

  // Solo depende de qc y toast (estables): la conexión se abre una vez y no se reabre
  // cada vez que cambian los datos de las búsquedas.
  useEffect(() => {
    const refresh = (...keys: string[]) => keys.forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
    const watcherName = (id: number) =>
      qc.getQueryData<WatcherWithStats[]>(['watchers'])?.find((w) => w.id === id)?.name ?? 'una búsqueda';

    const es = new EventSource('/api/events');
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.addEventListener('run:started', () => refresh('status', 'watchers'));
    es.addEventListener('run:finished', (e) => {
      refresh('status', 'watchers', 'runs', 'matches');
      const s = JSON.parse((e as MessageEvent).data) as RunSummary;
      const n = s.newMatchIds.length;
      const drops = s.priceDropMatchIds.length;
      if (n || drops) {
        const parts = [n && plural(n, 'nuevo'), drops && `${drops} bajó de precio`].filter(Boolean);
        toast({ tone: 'success', title: `${watcherName(s.watcherId)}: ${parts.join(' · ')}`, body: 'Revisa la pestaña Resultados.' });
      } else if (s.status === 'error') {
        toast({ tone: 'error', title: `Falló la búsqueda ${watcherName(s.watcherId)}`, body: s.errorMessage });
      }
    });
    es.addEventListener('session:changed', (e) => {
      refresh('status', 'settings');
      const notice = SESSION_TOASTS[JSON.parse((e as MessageEvent).data) as SessionState];
      if (notice) toast(notice);
    });
    return () => es.close();
  }, [qc, toast]);

  return connected;
}

// ---- Navegación por hash --------------------------------------------------------------

export type Route = 'inicio' | 'resultados' | 'busquedas' | 'actividad' | 'ajustes';
const ROUTES: Route[] = ['inicio', 'resultados', 'busquedas', 'actividad', 'ajustes'];

function parseHash(): { route: Route; params: URLSearchParams } {
  const [path = '', qs = ''] = window.location.hash.replace(/^#\/?/, '').split('?');
  const route = (ROUTES as string[]).includes(path) ? (path as Route) : 'inicio';
  return { route, params: new URLSearchParams(qs) };
}

export function useHashRoute() {
  const [state, setState] = useState(parseHash);
  useEffect(() => {
    const onChange = () => {
      setState(parseHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return state;
}

export function navigate(route: Route, params?: Record<string, string | number>) {
  const qs = params ? `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}` : '';
  window.location.hash = `/${route}${qs}`;
}
