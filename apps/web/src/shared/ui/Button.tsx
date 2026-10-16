import { type ButtonHTMLAttributes, forwardRef, type ReactNode, useId } from 'react';
import { Spinner } from './Spinner';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
  /** Shown next to a disabled button and linked via aria-describedby: a disabled action always says why. */
  disabledReason?: string;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, disabledReason, disabled, icon, children, className, type = 'button', ...rest },
  ref,
) {
  const reasonId = useId();
  const isDisabled = disabled || loading || !!disabledReason;
  const btn = (
    <button
      ref={ref}
      type={type}
      className={['btn', variant, size === 'sm' ? 'sm' : '', className].filter(Boolean).join(' ')}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-describedby={disabledReason ? reasonId : rest['aria-describedby']}
      {...rest}
    >
      {loading ? <Spinner size={14} label="" /> : icon}
      <span>{children}</span>
    </button>
  );
  if (!disabledReason) return btn;
  return (
    <span className="btn-wrap">
      {btn}
      <span id={reasonId} className="disabled-reason">
        {disabledReason}
      </span>
    </span>
  );
});
