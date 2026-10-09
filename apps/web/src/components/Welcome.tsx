import { ArrowRight, HardDrive, KeyRound, ShieldAlert, UserRound } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { navigate, useUpdateSettings } from '../lib/hooks';
import { Logo } from './brand/Logo';
import { Button, ErrorNote } from './ui';

const NOTICES: { icon: ReactNode; title: string; text: string }[] = [
  {
    icon: <ShieldAlert />,
    title: 'Facebook no permite la automatización',
    text: 'Sus términos de servicio prohíben revisar Marketplace con un bot. ProductFinderSV busca despacio y con pausas, pero tu cuenta podría recibir verificaciones o bloqueos. Lo usas bajo tu propio riesgo.',
  },
  {
    icon: <UserRound />,
    title: 'Mejor con una cuenta secundaria',
    text: 'Así, si Facebook pide una verificación, tu cuenta principal no se ve afectada.',
  },
  {
    icon: <KeyRound />,
    title: 'Tu contraseña no pasa por la app',
    text: 'Inicias sesión en una ventana normal de Microsoft Edge. ProductFinderSV nunca ve ni guarda tu contraseña.',
  },
  {
    icon: <HardDrive />,
    title: 'Todo se queda en tu PC',
    text: 'Búsquedas, resultados y sesión se guardan solo en este equipo. El panel no es accesible desde otros dispositivos de la red.',
  },
];

const STEPS = ['Aceptar este aviso', 'Conectar Facebook', 'Crear tu primera búsqueda'];

/**
 * Pantalla de primer arranque: aviso de riesgos que se acepta una vez. Los pasos siguientes
 * (conectar Facebook y crear la primera búsqueda) los guía la tarjeta "Para empezar" de Inicio.
 */
export function Welcome() {
  const [accepted, setAccepted] = useState(false);
  const save = useUpdateSettings();

  return (
    <div className="bg-grid min-h-screen px-4 py-8 md:py-14">
      <main className="mx-auto max-w-2xl rounded-panel border border-border bg-surface p-6 md:p-10">
        <Logo />
        <p className="label-tech mt-8 text-muted">Primer arranque</p>
        <h1 className="mt-2 text-[28px] leading-tight font-bold tracking-[-0.02em] md:text-[32px]">Antes de empezar</h1>
        <p className="mt-1.5 text-sm text-muted">
          ProductFinderSV revisa Facebook Marketplace por ti y te muestra las publicaciones que cumplen tus criterios.
        </p>

        <ul className="mt-7 space-y-5">
          {NOTICES.map((n) => (
            <li key={n.title} className="flex gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border text-fg [&>svg]:size-[18px] [&>svg]:stroke-[1.75]">
                {n.icon}
              </span>
              <div>
                <p className="text-sm font-semibold">{n.title}</p>
                <p className="mt-0.5 text-[13px] text-muted">{n.text}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-8 rounded-card border border-border bg-bg p-4">
          <p className="label-tech text-muted">Así empiezas</p>
          <ol className="mt-3 grid gap-2 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step} className="flex items-center gap-2 text-[13px] font-medium">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-fg font-mono text-[11px] font-semibold text-bg">
                  {String(i + 1).padStart(2, '0')}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>

        <label className="mt-7 flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-[var(--color-fg)]"
          />
          <span>Entiendo los riesgos y uso ProductFinderSV bajo mi propia responsabilidad.</span>
        </label>

        {save.error && (
          <div className="mt-4">
            <ErrorNote>{save.error.message}</ErrorNote>
          </div>
        )}

        <Button
          variant="primary"
          className="mt-5 w-full sm:w-auto"
          disabled={!accepted}
          loading={save.isPending}
          onClick={() => save.mutate({ riskNoticeAccepted: true }, { onSuccess: () => navigate('inicio') })}
        >
          Aceptar y continuar <ArrowRight className="size-4" />
        </Button>
      </main>
    </div>
  );
}
