import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogIn, Power, RotateCcw } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { sessionTone } from '../components/BotStatusCard';
import { ChoiceList, NOTIFY_CHOICES, type Choice } from '../components/ChoiceList';
import { TelegramSettings } from '../components/TelegramSettings';
import { useToast } from '../components/Toasts';
import { Button, Card, ConfirmDialog, Dot, ErrorNote, Field, NumberInput, PageHeader, PageLoader, Toggle } from '../components/ui';
import { api } from '../lib/api';
import { formatDateTime, SESSION_LABELS } from '../lib/format';
import { useAutostart, useConnectSession, useSettings, useStatus } from '../lib/hooks';
import type { BrowserMode, EditableSettings, Settings as SettingsData } from '../lib/types';

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
  notifyMode: 'all',
};

/** Separa lo editable en esta pantalla del estado que maneja el bot. */
function editableOf(s: SettingsData): EditableSettings {
  const { sessionState: _s, pausedUntil: _p, riskNoticeAccepted: _r, ...editable } = s;
  return editable;
}

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

const BROWSER_MODES: Choice<BrowserMode>[] = [
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
  // Solo lo que el usuario cambió: lo demás siempre refleja el servidor (también cambios hechos
  // desde fuera, como /pausar por Telegram o la bandeja), así "Guardar" nunca los deshace.
  const [edits, setEdits] = useState<Partial<EditableSettings>>({});
  const [error, setError] = useState<string | null>(null);

  const desktop = !!status.data?.desktop;
  const autostart = useAutostart(desktop);

  const save = useMutation({
    mutationFn: (patch: Partial<EditableSettings>) => api.updateSettings(patch),
    onSuccess: () => {
      setEdits({});
      setError(null);
      void qc.invalidateQueries();
      toast({ tone: 'success', title: 'Ajustes guardados' });
    },
    onError: (e) => setError(e.message),
  });
  const resume = useMutation({ mutationFn: api.resume, onSuccess: () => void qc.invalidateQueries() });
  const [confirmClose, setConfirmClose] = useState(false);
  // Qué pasa después de cerrarlo depende del inicio con Windows (igual que el aviso de la bandeja).
  const reopenHint =
    autostart.query.data?.enabled === true
      ? 'Volverá a arrancar solo la próxima vez que inicies sesión en Windows, o ábrelo antes desde el escritorio o el menú Inicio.'
      : 'Vuelve a abrirlo desde el escritorio o el menú Inicio.';
  const shutdown = useMutation({
    mutationFn: api.shutdown,
    onSuccess: () => {
      setConfirmClose(false);
      toast({ tone: 'info', title: 'ProductFinderSV se cerró', body: `Las búsquedas automáticas se detuvieron. ${reopenHint}` });
    },
  });

  if (!settings.data) return <PageLoader />;

  const { pausedUntil } = settings.data;
  const saved = editableOf(settings.data);
  const form: EditableSettings = { ...saved, ...edits };
  const changed = (Object.keys(edits) as (keyof EditableSettings)[]).filter((k) => edits[k] !== saved[k]);
  const set = <K extends keyof EditableSettings>(k: K, v: EditableSettings[K]) => setEdits((e) => ({ ...e, [k]: v }));

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
            <Button
              icon={<RotateCcw className="size-4" />}
              onClick={() => {
                // Los límites recomendados; el interruptor del bot y los avisos quedan como estén.
                const { schedulerEnabled: _on, notifyMode: _notify, ...recommended } = DEFAULTS;
                setEdits((e) => ({ ...e, ...recommended }));
              }}
            >
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
          <Button icon={<LogIn className="size-4" />} onClick={() => connect.mutate()} loading={connect.isPending || status.data?.loggingIn}>
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
            description="Apágalo para que el bot no busque solo. “Probar ahora” sigue funcionando, salvo durante una pausa por verificación de Facebook."
          />
          <ChoiceList
            name="browserMode"
            legend="Ventana del navegador al buscar"
            hint="El inicio de sesión en Facebook siempre se abre en una ventana visible."
            options={BROWSER_MODES}
            value={form.browserMode}
            onChange={(v) => set('browserMode', v)}
          />
        </Section>

        <Section
          title="Avisos de Windows"
          description="Avisos de Windows cuando una búsqueda automática termina. Al hacer clic se abren sus resultados. “Probar ahora” no avisa: el resultado ya se ve en el panel."
        >
          <ChoiceList
            name="notifyMode"
            legend="Avisarme de"
            options={NOTIFY_CHOICES}
            value={form.notifyMode}
            onChange={(v) => set('notifyMode', v)}
          />
        </Section>

        <Section title="Telegram" description="Recibe los avisos en el celular y controla el bot con comandos.">
          <TelegramSettings />
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
            {status.data?.service && (
              <>
                <dt className="label-tech self-center text-muted">En segundo plano</dt>
                <dd>desde {formatDateTime(status.data.service.since)}</dd>
                <dt className="label-tech self-center text-muted">Reinicios automáticos</dt>
                <dd title="Veces que ProductFinderSV se reinició solo porque el servicio se cerró o dejó de responder.">
                  {status.data.service.restarts === 0 ? 'Ninguno' : status.data.service.restarts}
                </dd>
              </>
            )}
          </dl>
          {desktop && (
            <Toggle
              checked={autostart.query.data?.enabled ?? false}
              disabled={!autostart.query.data || autostart.update.isPending}
              onChange={(enabled) =>
                autostart.update.mutate(enabled, {
                  onError: (e) => toast({ tone: 'error', title: 'No se pudo cambiar el inicio con Windows', body: e.message }),
                })
              }
              label="Iniciar con Windows"
              description="ProductFinderSV arranca en segundo plano al iniciar sesión, con su icono junto al reloj. Si lo apagas, empieza a buscar cuando lo abras (y sigue aunque cierres la ventana)."
            />
          )}
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
        message={`Se detendrán las búsquedas automáticas. ${reopenHint}`}
        confirmLabel="Cerrar"
        loading={shutdown.isPending}
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => shutdown.mutate()}
      />
    </>
  );
}
