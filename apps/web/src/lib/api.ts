import type {
  EditableSettings,
  Match,
  MatchFilter,
  MatchStatus,
  Run,
  RunSummary,
  Settings,
  Status,
  Watcher,
  WatcherInput,
  WatcherWithStats,
} from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? data.message ?? `Error ${res.status}`);
  return data as T;
}

function query(params: object): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue;
    if (Array.isArray(v)) v.forEach((x) => q.append(k, String(x)));
    else q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const api = {
  status: () => request<Status>('GET', '/api/status'),
  connectSession: () => request<{ queued: boolean }>('POST', '/api/session/connect'),
  resume: () => request<Status>('POST', '/api/scheduler/resume'),
  shutdown: () => request<{ stopping: boolean }>('POST', '/api/system/shutdown'),

  watchers: () => request<WatcherWithStats[]>('GET', '/api/watchers'),
  createWatcher: (w: WatcherInput) => request<Watcher>('POST', '/api/watchers', w),
  updateWatcher: (id: number, patch: Partial<WatcherInput>) => request<Watcher>('PATCH', `/api/watchers/${id}`, patch),
  deleteWatcher: (id: number) => request<void>('DELETE', `/api/watchers/${id}`),
  runWatcher: (id: number) => request<RunSummary>('POST', `/api/watchers/${id}/run?wait=true`),

  matches: (f: MatchFilter) => request<{ items: Match[]; total: number }>('GET', `/api/matches${query(f)}`),
  setMatchStatus: (id: number, status: MatchStatus) => request<Match>('PATCH', `/api/matches/${id}`, { status }),
  priceHistory: (listingId: string) =>
    request<{ price: number; seenAt: string }[]>('GET', `/api/listings/${listingId}/price-history`),

  runs: (limit = 100) => request<Run[]>('GET', `/api/runs${query({ limit })}`),
  settings: () => request<Settings>('GET', '/api/settings'),
  updateSettings: (patch: Partial<EditableSettings>) => request<Settings>('PATCH', '/api/settings', patch),
};
