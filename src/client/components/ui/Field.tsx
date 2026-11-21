import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { useId } from 'react';

interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (id: string) => ReactNode;
  className?: string;
}

export function Field({ label, hint, error, required, children, className = '' }: FieldProps) {
  const id = useId();
  return (
    <div className={`field ${className}`}>
      {label && (
        <label className="field-label" htmlFor={id}>
          {label} {required && <span className="req">*</span>}
        </label>
      )}
      {children(id)}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  suffix?: string;
  fieldClassName?: string;
}

export function Input({ label, hint, error, suffix, fieldClassName, ...rest }: InputProps) {
  return (
    <Field label={label} hint={hint} error={error} required={rest.required} className={fieldClassName}>
      {(id) => (
        <div className={suffix ? 'input-group' : undefined}>
          <input
            id={id}
            className="input"
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            {...rest}
          />
          {suffix && <span className="input-suffix">{suffix}</span>}
        </div>
      )}
    </Field>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options: Array<{ value: string; label: string }>;
  fieldClassName?: string;
}

export function Select({ label, hint, error, options, fieldClassName, ...rest }: SelectProps) {
  return (
    <Field label={label} hint={hint} error={error} required={rest.required} className={fieldClassName}>
      {(id) => (
        <select id={id} className="select" aria-invalid={error ? 'true' : undefined} {...rest}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  fieldClassName?: string;
}

export function Textarea({ label, hint, error, fieldClassName, ...rest }: TextareaProps) {
  return (
    <Field label={label} hint={hint} error={error} required={rest.required} className={fieldClassName}>
      {(id) => <textarea id={id} className="textarea" aria-invalid={error ? 'true' : undefined} {...rest} />}
    </Field>
  );
}

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode;
}

export function Checkbox({ label, ...rest }: CheckboxProps) {
  return (
    <label className="checkbox">
      <input type="checkbox" {...rest} />
      <span>{label}</span>
    </label>
  );
}
