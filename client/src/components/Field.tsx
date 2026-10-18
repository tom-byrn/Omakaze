import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';

interface FieldProps {
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  className?: string;
  children: ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }>;
}

/** Label, control and error message wired together for accessibility. */
export function Field({ label, error, hint, className = '', children }: FieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error || hint ? messageId : undefined,
      })
    : children;

  return (
    <div className={`field${error ? ' has-error' : ''} ${className}`}>
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      {control}
      {error ? (
        <p id={messageId} className="field__error">
          {error}
        </p>
      ) : (
        hint && (
          <p id={messageId} className="field__hint">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
