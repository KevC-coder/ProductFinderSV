import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogIn, Power, RotateCcw } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { sessionTone } from '../components/BotStatusCard';
import { useToast } from '../components/Toasts';
import { Badge, Button, Card, ConfirmDialog, cx, Dot, ErrorNote, Field, NumberInput, PageHeader, PageLoader, Toggle } from '../components/ui';
import { api } from '../lib/api';
import { formatDateTime, SESSION_LABELS } from '../lib/format';
import { useConnectSession, useSettings, useStatus } from '../lib/hooks';
import type { BrowserMode, EditableSettings } from '../lib/types';

const DEFAULTS: EditableSettings = {
  schedulerEnabled: true,
  browserMode: 'offscreen',
  maxRunsPerHour: 12,
  minIntervalMinutes: 30,
  jitterPercent: 20,
  minGapSeconds: 90,
  checkpointPauseHours: 8,
  errorBackoffMinutes: 15,
  maxBackoffMinutes: 240,
  maxResultsPerRun: 60,
};

type NumericKey = { [K in keyof EditableSettings]: EditableSettings[K] extends number ? K : never }[keyof EditableSettings];

/** Rangos iguales a los que valida el servidor. */
const NUMERIC: Record<NumericKey, { label: string; hint: string; suffix: string; min: number; max: number }> = {
  maxRunsPerHour: { label: 'Máximo de corridas por hora', hint: 'Entre todas las búsquedas.', suffix: '/hora', min: 1, max: 60 },
  minIntervalMinutes: { label: 'Mínimo entre corridas de una búsqueda', hint: 'Aunque pidas muchas veces al día.', suffix: 'min', min: 15, max: 1440 },
  minGapSeconds: { label: 'Pausa entre dos corridas cualesquiera', hint: 'Evita encadenar búsquedas seguidas.', suffix: 's', min: 30, max: 3600 },
  jitterPercent: { label: 'Variación aleatoria del horario', hint: 'Para no buscar siempre a la misma hora exacta.', suffix: '±%', min: 0, max: 50 },
  maxResultsPerRun: { label: 'Publicaciones a leer por corrida', hint: 'Más publicaciones = más scroll en Facebook.', suffix: 'pub.', min: 10, max: 200 },
  checkpointPauseHours: { label: 'Pausa si Facebook pide verificación', hint: 'El bot se detiene por completo durante este tiempo.', suffix: 'h', min: 1, max: 72 },
  errorBackoffMinutes: { label: 'Espera tras un error', hint: 'Se duplica con cada error seguido.', suffix: 'min', min: 5, max: 240 },
  maxBackoffMinutes: { label: 'Espera máxima tras errores', hint: 'Tope de la espera creciente.', suffix: 'min', min: 15, max: 1440 },
};

const BROWSER_MODES: { value: BrowserMode; title: string; text: string; recommended?: boolean }[] = [
  {
    value: 'offscreen',
    title: 'Fuera de pantalla',
    text: 'Edge abre una ventana normal pero fuera de tu pantalla: no la ves y Facebook la trata como un navegador común. Puede aparecer un momento en la barra de tareas.',
    recommended: true,
  },
  {
    value: 'visible',
    title: 'Visible',
    text: 'La ventana de Edge aparece mientras busca. Útil para ver qué hace el bot.',
  },
  {
    value: 'headless',
    title: 'Oculto',
    text: 'Sin ventana ni icono. Algo más fácil de detectar como bot: si ves verificaciones en Actividad, cambia de modo.',
  },
];

/** Selector del modo del navegador: tarjetas de opción con la recomendada marcada. */
function BrowserModePicker({ value, onChange }: { value: BrowserMode; onChange: (v: BrowserMode) => void }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold">Ventana del navegador al buscar</legend>
      <p className="mt-0.5 text-xs text-muted">El inicio de sesión en Facebook siempre se abre en una ventana visible.</p>
      <div className="mt-3 space-y-2">
        {BROWSER_MODES.map((m) => {
          const checked = value === m.value;
          return (
            <label
              key={m.value}
              className={cx(
                'relative flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors duration-200',
                checked ? 'border-border-strong bg-bg' : 'border-border hover:border-muted',
              )}
            >
              <input
                type="radio"
                name="browserMode"
                value={m.value}
                checked={checked}
                onChange={() => onChange(m.value)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--color-fg)]"
              />
              <span>
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {m.title}
                  {m.recommended && <Badge tone="brand">Recomendado</Badge>}
                </span>
                <span className="mt-0.5 block text-xs text-muted">{m.text}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold tracking-[-0.01em]">{title}</h2>
      {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      <div className="mt-5 space-y-5">{children}</div>
    </Card>
  );
}

export function Settings() {
  const settings = useSettings();
  const status = useStatus();
  const connect = useConnectSession();
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<EditableSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings.data && !form) {
      const { sessionState: _s, pausedUntil: _p, ...editable } = settings.data;
      setForm(editable);
    }
  }, [settings.data, form]);

  const save = useMutation({
    mutationFn: (patch: Partial<EditableSettings>) => api.updateSettings(patch),
    onSuccess: (saved) => {
      const { sessionState: _s, pausedUntil: _p, ...editable } = saved;
      setForm(editable);
      setError(null);
      void qc.invalidateQueries();
      toast({ tone: 'success', title: 'Ajustes guardados' });
    },
    onError: (e) => setError(e.message),
  });
  const resume = useMutation({ mutationFn: api.resume, onSuccess: () => void qc.invalidateQueries() });
  const [confirmClose, setConfirmClose] = useState(false);
  const shutdown = useMutation({
    mutationFn: api.shutdown,
    onSuccess: () => {
      setConfirmClose(false);
      toast({
        tone: 'info',
        title: 'ProductFinderSV se cerró',
        body: 'Las búsquedas automáticas se detuvieron. Vuelve a abrirlo desde el escritorio o el menú Inicio.',
      });
    },
  });

  if (!form || !settings.data) {
    return (
      <PageLoader />
    );
  }

  const { sessionState: _s, pausedUntil, ...saved } = settings.data;
  const changed = (Object.keys(form) as (keyof EditableSettings)[]).filter((k) => form[k] !== saved[k]);
  const set = <K extends keyof EditableSettings>(k: K, v: EditableSettings[K]) => setForm({ ...form, [k]: v });

  const numberField = (key: NumericKey) => {
    const f = NUMERIC[key];
    return (
      <Field key={key} label={f.label} hint={`${f.hint} Por defecto: ${DEFAULTS[key]} ${f.suffix}.`}>
        {(id) => (
          <NumberInput id={id} value={form[key]} onChange={(v) => set(key, v ?? DEFAULTS[key])} min={f.min} max={f.max} suffix={f.suffix} />
        )}
      </Field>
    );
  };

  const paused = pausedUntil && Date.parse(pausedUntil) > Date.now();
  const sessionState = status.data?.sessionState ?? settings.data.sessionState;

  return (
    <>
      <PageHeader
        eyebrow="Configuración"
        title="Ajustes"
        subtitle="Cómo y cuánto busca el bot. Valores más conservadores = menos riesgo para tu cuenta."
        actions={
          <>
            <Button icon={<RotateCcw className="size-4" />} onClick={() => setForm({ ...DEFAULTS, schedulerEnabled: form.schedulerEnabled })}>
              Valores recomendados
            </Button>
            <Button
              variant="primary"
              disabled={!changed.length}
              loading={save.isPending}
              onClick={() => save.mutate(Object.fromEntries(changed.map((k) => [k, form[k]])))}
            >
              Guardar{changed.length ? ` (${changed.length})` : ''}
            </Button>
          </>
        }
      />
      {error && (
        <div className="mb-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Cuenta de Facebook">
          <p className="flex items-center gap-2 text-sm">
            <Dot tone={sessionTone(sessionState)} />
            {SESSION_LABELS[sessionState]}
          </p>
          <p className="text-[13px] text-muted">
            Se abre una ventana de Microsoft Edge con el perfil de la app para que inicies sesión. La app nunca ve ni guarda tu
            contraseña. Te recomendamos usar una cuenta secundaria.
          </p>
          <Button icon={<LogIn className="size-4" />} onClick={() => connect.mutate()} loading={connect.isPending || status.data?.queue.active === 'login'}>
            {sessionState === 'connected' ? 'Volver a iniciar sesión' : 'Conectar Facebook'}
          </Button>
          {paused && (
            <div role="alert" className="rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm text-warning">
              <p>Bot en pausa por seguridad hasta {formatDateTime(pausedUntil)}.</p>
              <Button size="sm" className="mt-2" onClick={() => resume.mutate()} loading={resume.isPending}>
                Ya resolví la verificación, reanudar
              </Button>
            </div>
          )}
        </Section>

        <Section title="Bot">
          <Toggle
            checked={form.schedulerEnabled}
            onChange={(v) => set('schedulerEnabled', v)}
            label="Búsquedas automáticas"
            description="Apágalo para que el bot no busque solo. “Probar ahora” sigue funcionando."
          />
          <BrowserModePicker value={form.browserMode} onChange={(v) => set('browserMode', v)} />
        </Section>

        <Section title="Frecuencia y límites" description="Protegen tu cuenta: Facebook puede bloquear patrones demasiado frecuentes.">
          {numberField('maxRunsPerHour')}
          {numberField('minIntervalMinutes')}
          {numberField('minGapSeconds')}
          {numberField('jitterPercent')}
          {numberField('maxResultsPerRun')}
        </Section>

        <Section title="Errores y verificaciones">
          {numberField('checkpointPauseHours')}
          {numberField('errorBackoffMinutes')}
          {numberField('maxBackoffMinutes')}
        </Section>

        <Section title="Aplicación">
          <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-sm">
            <dt className="label-tech self-center text-muted">Versión</dt>
            <dd className="font-mono">{status.data?.version ?? '—'}</dd>
          </dl>
          {status.data?.canShutdown && (
            <div>
              <Button icon={<Power className="size-4" />} onClick={() => setConfirmClose(true)}>
                Cerrar ProductFinderSV
              </Button>
              <p className="mt-1.5 text-xs text-muted">
                Cerrar la ventana no detiene el bot: sigue buscando en segundo plano. Usa este botón para detenerlo por completo.
              </p>
            </div>
          )}
        </Section>
      </div>

      <ConfirmDialog
        open={confirmClose}
        title="Cerrar ProductFinderSV"
        message="Se detendrán las búsquedas automáticas hasta que vuelvas a abrir ProductFinderSV desde el escritorio o el menú Inicio."
        confirmLabel="Cerrar"
        loading={shutdown.isPending}
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => shutdown.mutate()}
      />
    </>
  );
}
