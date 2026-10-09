import { X } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { CHIP_TONES, cx, type Tone } from './ui';

/** Lista de palabras/frases: Enter o coma para agregar, Backspace para quitar la última. */
export function TagInput({
  id,
  value,
  onChange,
  placeholder,
  tone = 'neutral',
}: {
  id?: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  tone?: Tone;
}) {
  const [draft, setDraft] = useState('');

  const add = (raw: string) => {
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const next = [...value];
    for (const p of parts) if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p);
    if (next.length !== value.length) onChange(next);
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5 transition-colors duration-200 hover:border-muted focus-within:border-border-strong">
      {value.map((tag) => (
        <span key={tag} className={cx('inline-flex items-center gap-1 rounded-md py-0.5 pr-1 pl-2 text-[13px] font-medium', CHIP_TONES[tone])}>
          {tag}
          <button
            type="button"
            aria-label={`Quitar ${tag}`}
            onClick={() => onChange(value.filter((v) => v !== tag))}
            className="rounded p-0.5 opacity-60 hover:opacity-100"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => draft && add(draft)}
        placeholder={value.length ? '' : placeholder}
        className="h-6 min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted/70"
      />
    </div>
  );
}
