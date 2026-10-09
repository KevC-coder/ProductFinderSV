import { useEffect, useState, type ReactNode } from 'react';
import { CONDITION_LABELS } from '../lib/format';
import { useSaveWatcher } from '../lib/hooks';
import type { ItemCondition, Watcher, WatcherInput } from '../lib/types';
import { TagInput } from './TagInput';
import { Button, Field, Input, Modal, NumberInput, Select, Toggle } from './ui';

export const EMPTY_WATCHER: WatcherInput = {
  name: '',
  query: '',
  mustKeywords: [],
  mustMode: 'all',
  bonusKeywords: [],
  excludeKeywords: [],
  searchDescription: true,
  minPrice: null,
  maxPrice: null,
  idealPrice: null,
  locationSlug: null,
  radiusKm: null,
  conditions: [],
  maxAgeHours: 168,
  runsPerDay: 6,
  windowStart: '07:00',
  windowEnd: '23:00',
  maxDetails: 5,
  active: true,
};

const AGE_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'Cualquier fecha', value: null },
  { label: 'Últimas 24 horas', value: 24 },
  { label: 'Últimos 3 días', value: 72 },
  { label: 'Últimos 7 días', value: 168 },
  { label: 'Últimos 30 días', value: 720 },
];

/**
 * Copia solo los campos editables. La búsqueda que llega de la lista trae además datos de
 * presentación (lastRun, matches, queued…) que el servidor rechaza al guardar.
 */
function toInput(w: Watcher): WatcherInput {
  const input = { ...EMPTY_WATCHER };
  for (const key of Object.keys(EMPTY_WATCHER) as (keyof WatcherInput)[]) {
    (input as Record<string, unknown>)[key] = w[key];
  }
  return input;
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <fieldset className="border-t border-border pt-5 [counter-increment:pf-section] first:border-t-0 first:pt-0">
      <legend className="sr-only">{title}</legend>
      {/* Numeración técnica "01", "02"… */}
      <h3 className="flex items-baseline gap-2 text-base font-semibold before:font-mono before:text-xs before:text-muted before:content-[counter(pf-section,decimal-leading-zero)]">
        {title}
      </h3>
      {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </fieldset>
  );
}

export function WatcherForm({
  open,
  watcher,
  onClose,
}: {
  open: boolean;
  /** null = crear una nueva. */
  watcher: Watcher | null;
  onClose: () => void;
}) {
  const [form, setForm] = useState<WatcherInput>(EMPTY_WATCHER);
  const [error, setError] = useState<string | null>(null);
  const save = useSaveWatcher();

  useEffect(() => {
    if (open) {
      setForm(watcher ? toInput(watcher) : EMPTY_WATCHER);
      setError(null);
    }
  }, [open, watcher]);

  const set = <K extends keyof WatcherInput>(key: K, value: WatcherInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const validate = (): string | null => {
    if (!form.name.trim()) return 'Ponle un nombre a la búsqueda.';
    if (!form.query.trim()) return 'Escribe qué buscar en Marketplace.';
    if (form.minPrice != null && form.maxPrice != null && form.minPrice > form.maxPrice) {
      return 'El precio mínimo no puede ser mayor que el máximo.';
    }
    return null;
  };

  const submit = () => {
    const problem = validate();
    if (problem) return setError(problem);
    const data = { ...form, name: form.name.trim(), query: form.query.trim(), locationSlug: form.locationSlug?.trim() || null };
    save.mutate({ id: watcher?.id, data }, { onSuccess: onClose, onError: (e) => setError(e.message) });
  };

  const toggleCondition = (c: ItemCondition) =>
    set('conditions', form.conditions.includes(c) ? form.conditions.filter((x) => x !== c) : [...form.conditions, c]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      eyebrow={watcher ? 'Editar criterios' : 'Nuevos criterios'}
      title={watcher ? watcher.name : 'Nueva búsqueda'}
      footer={
        <>
          {/* Junto a los botones para que se vea aunque el formulario esté desplazado. */}
          {error && (
            <p role="alert" className="mr-auto self-center text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={submit} loading={save.isPending}>
            {watcher ? 'Guardar cambios' : 'Crear búsqueda'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-6 [counter-reset:pf-section]"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Section title="Qué buscar">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre" hint="Para reconocerla en el panel.">
              {(id) => (
                <Input id={id} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="iPhone 13 barato" />
              )}
            </Field>
            <Field label="Texto de búsqueda en Marketplace" hint="Lo que escribirías en el buscador de Facebook.">
              {(id) => (
                <Input id={id} value={form.query} onChange={(e) => set('query', e.target.value)} placeholder="iphone 13" />
              )}
            </Field>
          </div>
        </Section>

        <Section
          title="Palabras clave"
          description="Se comparan sin acentos ni mayúsculas y como palabras completas: “128gb” también encuentra “128 GB”. Enter o coma para agregar."
        >
          <Field label="Obligatorias">
            {(id) => (
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="flex-1">
                  <TagInput id={id} value={form.mustKeywords} onChange={(v) => set('mustKeywords', v)} placeholder="13, liberado…" tone="inverse" />
                </div>
                <Select
                  aria-label="Modo de las obligatorias"
                  value={form.mustMode}
                  onChange={(e) => set('mustMode', e.target.value as WatcherInput['mustMode'])}
                  className="w-full sm:w-52"
                >
                  <option value="all">Deben estar todas</option>
                  <option value="any">Basta con una</option>
                </Select>
              </div>
            )}
          </Field>
          <Field label="Deseables" hint="No son obligatorias, pero suben la puntuación del resultado.">
            {(id) => (
              <TagInput id={id} value={form.bonusKeywords} onChange={(v) => set('bonusKeywords', v)} placeholder="128gb, batería 9…" tone="brand" />
            )}
          </Field>
          <Field label="Excluir si contiene" hint="Frases completas: “icloud bloqueado” no descarta “libre de iCloud”.">
            {(id) => (
              <TagInput id={id} value={form.excludeKeywords} onChange={(v) => set('excludeKeywords', v)} placeholder="repuesto, golpe, pro max…" tone="danger" />
            )}
          </Field>
          <Toggle
            checked={form.searchDescription}
            onChange={(v) => set('searchDescription', v)}
            label="Buscar también en la descripción"
            description="El bot abre las publicaciones para leer su descripción. Más preciso, pero cada apertura es una visita más a Facebook."
          />
          {form.searchDescription && (
            <Field label="Máximo de descripciones a revisar por corrida" className="sm:w-72">
              {(id) => (
                <NumberInput id={id} value={form.maxDetails} onChange={(v) => set('maxDetails', v ?? 0)} min={0} max={20} />
              )}
            </Field>
          )}
        </Section>

        <Section title="Precio" description="En dólares (USD).">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Mínimo">
              {(id) => <NumberInput id={id} value={form.minPrice} onChange={(v) => set('minPrice', v)} min={0} suffix="USD" />}
            </Field>
            <Field label="Máximo">
              {(id) => <NumberInput id={id} value={form.maxPrice} onChange={(v) => set('maxPrice', v)} min={0} suffix="USD" />}
            </Field>
            <Field label="Precio ideal" hint="Lo que esté por debajo se marca como “precio ideal”.">
              {(id) => <NumberInput id={id} value={form.idealPrice} onChange={(v) => set('idealPrice', v)} min={0} suffix="USD" />}
            </Field>
          </div>
        </Section>

        <Section title="Filtros">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Antigüedad máxima">
              {(id) => (
                <Select
                  id={id}
                  value={form.maxAgeHours ?? ''}
                  onChange={(e) => set('maxAgeHours', e.target.value === '' ? null : Number(e.target.value))}
                >
                  {AGE_OPTIONS.map((o) => (
                    <option key={o.label} value={o.value ?? ''}>
                      {o.label}
                    </option>
                  ))}
                  {form.maxAgeHours != null && !AGE_OPTIONS.some((o) => o.value === form.maxAgeHours) && (
                    <option value={form.maxAgeHours}>Últimas {form.maxAgeHours} horas</option>
                  )}
                </Select>
              )}
            </Field>
            <Field label="Ciudad (opcional)" hint="Vacío = la ubicación de tu cuenta de Facebook.">
              {(id) => (
                <Input
                  id={id}
                  value={form.locationSlug ?? ''}
                  onChange={(e) => set('locationSlug', e.target.value || null)}
                  placeholder="sansalvador"
                />
              )}
            </Field>
            <Field label="Radio">
              {(id) => <NumberInput id={id} value={form.radiusKm} onChange={(v) => set('radiusKm', v)} min={1} suffix="km" />}
            </Field>
          </div>
          <div>
            <p className="mb-1.5 text-[13px] font-semibold">Condición</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {(Object.keys(CONDITION_LABELS) as ItemCondition[]).map((c) => (
                <label key={c} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.conditions.includes(c)}
                    onChange={() => toggleCondition(c)}
                    className="size-4 accent-[var(--color-fg)]"
                  />
                  {CONDITION_LABELS[c]}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted">Sin marcar ninguna = cualquier condición.</p>
          </div>
        </Section>

        <Section title="Horario" description="El bot reparte las búsquedas del día dentro de este horario, con variaciones aleatorias.">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Veces al día">
              {(id) => (
                <NumberInput id={id} value={form.runsPerDay} onChange={(v) => set('runsPerDay', v ?? 1)} min={1} max={48} />
              )}
            </Field>
            <Field label="Desde">
              {(id) => <Input id={id} type="time" value={form.windowStart} onChange={(e) => set('windowStart', e.target.value)} />}
            </Field>
            <Field label="Hasta">
              {(id) => <Input id={id} type="time" value={form.windowEnd} onChange={(e) => set('windowEnd', e.target.value)} />}
            </Field>
          </div>
          <Toggle
            checked={form.active}
            onChange={(v) => set('active', v)}
            label="Búsqueda activa"
            description="Si la desactivas, el bot deja de ejecutarla (los resultados se conservan)."
          />
        </Section>

        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
