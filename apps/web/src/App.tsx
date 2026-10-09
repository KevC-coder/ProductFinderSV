import { Activity as ActivityIcon, Home, LayoutGrid, Monitor, Moon, Search, Settings as SettingsIcon, Sun, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { Isotipo } from './components/brand/Isotipo';
import { Logo } from './components/brand/Logo';
import { botHeadline, isSearching, sessionTone } from './components/BotStatusCard';
import { cx, Dot, Spinner } from './components/ui';
import { SESSION_LABELS } from './lib/format';
import { useHashRoute, useLiveEvents, useStatus, type Route } from './lib/hooks';
import { useTheme, type Theme } from './lib/theme';
import { Activity } from './pages/Activity';
import { Overview } from './pages/Overview';
import { Results } from './pages/Results';
import { Settings } from './pages/Settings';
import { Watchers } from './pages/Watchers';

const NAV: { route: Route; label: string; icon: ReactNode }[] = [
  { route: 'inicio', label: 'Inicio', icon: <Home className="size-4" /> },
  { route: 'resultados', label: 'Resultados', icon: <LayoutGrid className="size-4" /> },
  { route: 'busquedas', label: 'Búsquedas', icon: <Search className="size-4" /> },
  { route: 'actividad', label: 'Actividad', icon: <ActivityIcon className="size-4" /> },
  { route: 'ajustes', label: 'Ajustes', icon: <SettingsIcon className="size-4" /> },
];

const THEMES: { value: Theme; label: string; icon: ReactNode }[] = [
  { value: 'light', label: 'Modo claro', icon: <Sun className="size-3.5" /> },
  { value: 'dark', label: 'Modo oscuro', icon: <Moon className="size-3.5" /> },
  { value: 'system', label: 'Según Windows', icon: <Monitor className="size-3.5" /> },
];

function ThemeSwitch() {
  const [theme, setTheme] = useTheme();
  return (
    <div role="radiogroup" aria-label="Tema" className="flex rounded-lg border border-border p-0.5">
      {THEMES.map((t) => (
        <button
          key={t.value}
          role="radio"
          aria-checked={theme === t.value}
          title={t.label}
          aria-label={t.label}
          onClick={() => setTheme(t.value)}
          className={cx(
            'flex h-7 flex-1 items-center justify-center rounded-md transition-colors duration-200',
            theme === t.value ? 'bg-selected text-selected-fg' : 'text-muted hover:text-fg',
          )}
        >
          {t.icon}
        </button>
      ))}
    </div>
  );
}

export function App() {
  const { route, params } = useHashRoute();
  const status = useStatus();
  const live = useLiveEvents();

  const newCount = status.data?.matches.new ?? 0;
  const s = status.data;

  const navLinks = (mobile: boolean) =>
    NAV.map((n) => {
      const active = route === n.route;
      return (
        <a
          key={n.route}
          href={`#/${n.route}`}
          aria-current={active ? 'page' : undefined}
          className={cx(
            'flex items-center gap-2.5 rounded-lg text-sm font-semibold transition-colors duration-200',
            mobile ? 'h-9 shrink-0 px-3' : 'h-10 px-3',
            active ? 'bg-selected text-selected-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
          )}
        >
          {n.icon}
          {n.label}
          {n.route === 'resultados' && newCount > 0 && (
            <span className="ml-auto rounded bg-lime px-1.5 font-mono text-[11px] font-semibold text-ink tabular-nums">{newCount}</span>
          )}
        </a>
      );
    });

  return (
    <div className="min-h-screen md:grid md:grid-cols-[248px_1fr]">
      {/* Barra lateral (escritorio) */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-border bg-surface px-4 py-5 md:flex">
        <a href="#/inicio" className="px-1">
          <Logo />
        </a>
        <p className="label-tech mt-2 px-1 !text-[9.5px] text-muted">Automated product discovery</p>
        <nav aria-label="Principal" className="mt-8 flex flex-col gap-1">
          {navLinks(false)}
        </nav>
        <div className="mt-auto space-y-3">
          {s && (
            <div className="space-y-1.5 rounded-lg border border-border bg-bg p-3 text-xs">
              <p className="flex items-center gap-2 font-semibold">
                <Dot tone={sessionTone(s.sessionState)} />
                {SESSION_LABELS[s.sessionState]}
              </p>
              <p className="flex items-start gap-1.5 text-muted">
                {isSearching(s) && <Spinner className="mt-px size-3 shrink-0" />}
                {botHeadline(s)}
              </p>
            </div>
          )}
          <ThemeSwitch />
          {s && <p className="label-tech text-center !text-[9.5px] text-muted">v{s.version}</p>}
        </div>
      </aside>

      {/* Barra superior (móvil): en espacios estrechos solo el isotipo */}
      <header className="sticky top-0 z-10 border-b border-border bg-surface md:hidden">
        <div className="flex items-center justify-between px-4 py-2.5">
          <a href="#/inicio" aria-label="ProductFinderSV, inicio" className="flex items-center gap-2">
            <Isotipo size={28} />
            <span className="font-display text-base font-bold tracking-[-0.04em]">ProductFinderSV</span>
          </a>
          {s && (
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <Dot tone={sessionTone(s.sessionState)} />
              {isSearching(s) ? 'Buscando…' : s.sessionState === 'connected' ? 'Conectado' : 'Sin sesión'}
            </span>
          )}
        </div>
        <nav aria-label="Principal" className="flex gap-1 overflow-x-auto px-3 pb-2.5 [scrollbar-width:none]">
          {navLinks(true)}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[1280px] px-4 py-7 md:px-10 md:py-10">
        {!live && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
            <WifiOff className="size-4" />
            ProductFinderSV no está en ejecución. Ábrelo desde el acceso directo del escritorio o del menú Inicio.
          </div>
        )}
        {route === 'inicio' && <Overview />}
        {route === 'resultados' && <Results params={params} />}
        {route === 'busquedas' && <Watchers />}
        {route === 'actividad' && <Activity />}
        {route === 'ajustes' && <Settings />}
      </main>
    </div>
  );
}
