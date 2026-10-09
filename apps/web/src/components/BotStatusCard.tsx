import { LogIn, Pause, Play, ShieldAlert } from 'lucide-react';
import { BLOCKED_LABELS, formatDateTime, relativeTime, SESSION_LABELS } from '../lib/format';
import { useConnectSession, useResume, useStatus, useUpdateSettings } from '../lib/hooks';
import type { Status } from '../lib/types';
import { FocusCorners } from './brand/FocusFrame';
import { Button, cx, Dot, Spinner, type Tone } from './ui';

export function sessionTone(s: Status['sessionState']): Tone {
  return s === 'connected' ? 'success' : s === 'unknown' ? 'neutral' : 'danger';
}

export const isSearching = (s: Status) => s.searchingWatcherId !== null;

/** Resumen en una frase de lo que está haciendo el bot. */
export function botHeadline(s: Status): string {
  if (isSearching(s)) return 'Buscando en Marketplace…';
  if (s.loggingIn) return 'Esperando que inicies sesión en Facebook…';
  if (!s.schedulerEnabled) return 'Bot apagado';
  if (s.blockedReason === 'logged_out') return 'Conecta Facebook para empezar a buscar';
  if (s.blockedReason === 'paused') return `En pausa por seguridad hasta ${formatDateTime(s.pausedUntil)}`;
  if (s.blockedReason === 'rate_limit') return BLOCKED_LABELS.rate_limit;
  if (!s.nextRun) return 'Activo · sin búsquedas programadas';
  return `Activo · próxima búsqueda “${s.nextRun.name}” ${relativeTime(s.nextRun.at)}`;
}

/** Mira decorativa: esquinas lima, cruz central y línea de escaneo cuando el bot trabaja. */
function Reticle({ scanning }: { scanning: boolean }) {
  return (
    <div aria-hidden className="relative hidden size-28 shrink-0 md:block">
      <span className="absolute inset-y-0 left-1/2 w-px bg-white/15" />
      <span className="absolute inset-x-0 top-1/2 h-px bg-white/15" />
      <div className="absolute inset-5 overflow-hidden">
        <FocusCorners className="border-lime" size={16} thickness={3} />
        {scanning && (
          <span className="absolute inset-x-2 top-0 h-full animate-[pf-scan_1.2s_ease-in-out_infinite_alternate]">
            <span className="block h-0.5 w-full bg-lime" />
          </span>
        )}
      </div>
      <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-mono text-sm leading-none text-white/70">+</span>
    </div>
  );
}

export function BotStatusCard() {
  const status = useStatus();
  const connect = useConnectSession();
  const settings = useUpdateSettings();
  const toggle = (schedulerEnabled: boolean) => settings.mutate({ schedulerEnabled });
  const resume = useResume();

  const s = status.data;
  return (
    <section
      aria-label="Estado del bot"
      className="relative overflow-hidden rounded-panel bg-panel text-white [--color-grid-line:rgb(255_255_255/0.06)]"
    >
      {/* Retícula solo en la mitad derecha, lejos del texto. */}
      <div aria-hidden className="bg-grid absolute inset-y-0 right-0 w-1/2 [mask-image:linear-gradient(to_left,black,transparent)]" />
      {!s ? (
        <div className="relative flex h-36 items-center justify-center">
          <Spinner className="text-white/60" />
        </div>
      ) : (
        <div className="relative flex items-center gap-6 p-6 md:p-7">
          <div className="min-w-0 flex-1">
            <p className="label-tech text-white/55">Estado del bot</p>
            <p className="mt-3 flex items-center gap-2 text-[13px] text-white/75">
              <Dot tone={sessionTone(s.sessionState)} />
              {SESSION_LABELS[s.sessionState]}
            </p>
            <p className="mt-1.5 flex items-center gap-2.5 font-display text-xl font-semibold tracking-[-0.01em] md:text-2xl">
              {isSearching(s) && <Spinner className="size-5 text-lime" />}
              {botHeadline(s)}
            </p>
            <p className="label-tech mt-2 text-white/55">
              {s.runsLastHour}/{s.maxRunsPerHour} corridas en la última hora
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {s.sessionState !== 'connected' && (
                <Button
                  variant="primary"
                  icon={<LogIn className="size-4" />}
                  onClick={() => connect.mutate()}
                  loading={connect.isPending || s.loggingIn}
                >
                  Conectar Facebook
                </Button>
              )}
              {s.blockedReason === 'paused' && (
                <Button variant="on-dark" icon={<ShieldAlert className="size-4" />} onClick={() => resume.mutate()} loading={resume.isPending}>
                  Ya lo resolví, reanudar
                </Button>
              )}
              {s.schedulerEnabled ? (
                <Button variant="on-dark" icon={<Pause className="size-4" />} onClick={() => toggle(false)} loading={settings.isPending}>
                  Pausar bot
                </Button>
              ) : (
                <Button variant="primary" icon={<Play className="size-4" />} onClick={() => toggle(true)} loading={settings.isPending}>
                  Encender bot
                </Button>
              )}
            </div>
          </div>
          <div className={cx(!s.schedulerEnabled && 'opacity-40')}>
            <Reticle scanning={isSearching(s)} />
          </div>
        </div>
      )}
    </section>
  );
}
