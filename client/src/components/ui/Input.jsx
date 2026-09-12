import { forwardRef } from 'react';
import { cn } from '../../lib/cn.js';

const Input = forwardRef(function Input(
  { label, id, error, hint, icon: Icon, className, containerClassName, ...props },
  ref
) {
  return (
    <div className={containerClassName}>
      {label && <label htmlFor={id} className="label">{label}</label>}
      <div className="relative">
        {Icon && (
          <Icon size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        )}
        <input
          ref={ref}
          id={id}
          className={cn('input', Icon && 'pl-10', error && 'border-danger focus:border-danger focus:ring-danger/15', className)}
          {...props}
        />
      </div>
      {error ? <p className="field-error">{error}</p> : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
});

export default Input;
