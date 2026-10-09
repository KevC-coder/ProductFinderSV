import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { cx } from './ui';

type ToastTone = 'success' | 'info' | 'error';
interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  body?: ReactNode;
}

export type ToastInput = Omit<Toast, 'id'>;

const ToastContext = createContext<(t: ToastInput) => void>(() => {});
export const useToast = () => useContext(ToastContext);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = (id: number) => setToasts((ts) => ts.filter((t) => t.id !== id));
  const push = useCallback((t: ToastInput) => {
    const id = nextId++;
    setToasts((ts) => [...ts.slice(-3), { ...t, id }]);
    setTimeout(() => dismiss(id), 7000);
  }, []);

  const icons = {
    success: <CheckCircle2 className="size-5 shrink-0 text-success" />,
    info: <Info className="size-5 shrink-0 text-fg" />,
    error: <TriangleAlert className="size-5 shrink-0 text-danger" />,
  };

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="fixed right-4 bottom-4 z-50 flex w-[min(380px,calc(100%-2rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              'flex items-start gap-3 rounded-card border border-border bg-surface p-3.5 shadow-lg',
              t.tone === 'success' && 'border-l-4 border-l-lime',
              t.tone === 'error' && 'border-l-4 border-l-danger',
            )}
          >
            {icons[t.tone]}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t.title}</p>
              {t.body && <div className="mt-0.5 text-sm text-muted">{t.body}</div>}
            </div>
            <button aria-label="Cerrar" onClick={() => dismiss(t.id)} className="text-muted hover:text-fg">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
