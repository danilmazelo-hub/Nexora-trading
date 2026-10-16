import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';

type Tone = 'info' | 'success' | 'error';
interface ToastItem {
  id: number;
  tone: Tone;
  text: string;
}
const Ctx = createContext<((text: string, tone?: Tone) => void) | null>(null);

/** Polite live region; errors use role="alert". Each toast auto-hides after 5 s and can be closed. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const close = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (text: string, tone: Tone = 'info') => {
      const id = ++seq.current;
      setItems((l) => [...l.slice(-3), { id, tone, text }]);
      setTimeout(() => close(id), 5000);
    },
    [close],
  );
  const value = useMemo(() => push, [push]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={'toast ' + t.tone} role={t.tone === 'error' ? 'alert' : 'status'}>
            <span>{t.text}</span>
            <button type="button" className="icon-btn" aria-label="Закрыть уведомление" onClick={() => close(t.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast must be used inside ToastProvider');
  return v;
}
