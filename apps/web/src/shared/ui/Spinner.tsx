export function Spinner({ size = 18, label = 'Загрузка…' }: { size?: number; label?: string }) {
  return (
    <span className="spinner-wrap" role={label ? 'status' : undefined}>
      <span className="spinner" style={{ width: size, height: size }} aria-hidden="true" />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
