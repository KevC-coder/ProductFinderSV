import type { NotifyMode } from '../lib/types';
import { Badge, cx } from './ui';

export interface Choice<T extends string> {
  value: T;
  title: string;
  text: string;
  recommended?: boolean;
}

/** Qué resultados se avisan (Windows y Telegram usan las mismas opciones). */
export const NOTIFY_CHOICES: Choice<NotifyMode>[] = [
  {
    value: 'all',
    title: 'Resultados nuevos y bajadas de precio',
    text: 'Un aviso por búsqueda cuando encuentra algo nuevo, con el resultado de mayor puntuación.',
  },
  {
    value: 'ideal',
    title: 'Solo precio ideal',
    text: 'Solo lo que está en el precio ideal de la búsqueda o por debajo. Las búsquedas sin precio ideal no avisan.',
  },
  {
    value: 'off',
    title: 'Sin avisos',
    text: 'Los resultados se ven solo en el panel.',
  },
];

/** Opciones excluyentes en tarjetas, con la recomendada marcada. */
export function ChoiceList<T extends string>({
  name,
  legend,
  hint,
  options,
  value,
  onChange,
}: {
  name: string;
  legend: string;
  hint?: string;
  options: Choice<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold">{legend}</legend>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      <div className="mt-3 space-y-2">
        {options.map((m) => {
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
                name={name}
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
