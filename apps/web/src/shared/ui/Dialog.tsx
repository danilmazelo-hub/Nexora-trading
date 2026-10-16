import { type ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Element focused on open; defaults to the first focusable element in the dialog. */
  initialFocusSelector?: string;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog: focus moves inside, Tab/Shift+Tab are trapped, Escape closes, and focus returns to the element
 * that opened it.
 */
export function Dialog({ open, title, onClose, children, footer, initialFocusSelector }: DialogProps) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const box = ref.current;
    const first = (initialFocusSelector && box?.querySelector<HTMLElement>(initialFocusSelector)) || box?.querySelector<HTMLElement>(FOCUSABLE) || box;
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
      if (e.key === 'Tab' && box) {
        const items = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (!items.length) return;
        const firstEl = items[0]!;
        const lastEl = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open, initialFocusSelector]);

  if (!open) return null;
  return createPortal(
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="dialog-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer ? <div className="dialog-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
