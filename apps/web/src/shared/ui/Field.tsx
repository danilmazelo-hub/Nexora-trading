import { cloneElement, type InputHTMLAttributes, isValidElement, type ReactElement, type ReactNode, type SelectHTMLAttributes, useId } from 'react';

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  /** A single control (Input/Select/textarea); id, aria-invalid and aria-describedby are wired automatically. */
  children: ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }>;
  className?: string;
}

/** Label + control + hint + error. A placeholder never replaces the label. */
export function Field({ label, hint, error, children, className }: FieldProps) {
  const id = useId();
  const hintId = hint ? id + '-hint' : undefined;
  const errId = error ? id + '-err' : undefined;
  const described = [hintId, errId].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children) ? cloneElement(children, { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': described }) : children;
  return (
    <div className={['field', error ? 'has-error' : '', className].filter(Boolean).join(' ')}>
      <label htmlFor={id}>{label}</label>
      {control}
      {hint ? (
        <span id={hintId} className="hint">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errId} className="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />;
}

export function Select({ options, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string; disabled?: boolean }[] }) {
  return (
    <select className="input select" {...props}>
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
