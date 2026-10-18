import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDownIcon } from './Icons';

interface PopoverProps {
  label: ReactNode;
  /** Highlights the trigger, e.g. when the filter inside is set. */
  active?: boolean;
  align?: 'left' | 'right';
  className?: string;
  children: ReactNode | ((close: () => void) => ReactNode);
}

/** A trigger button with a small panel underneath; closes on outside click or Escape. */
export function Popover({ label, active = false, align = 'left', className = '', children }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className={`popover ${className}`} ref={containerRef}>
      <button
        type="button"
        className={`filter-button${active ? ' is-active' : ''}${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
        <ChevronDownIcon size={16} />
      </button>
      {open && (
        <div id={panelId} className={`popover__panel popover__panel--${align}`} role="dialog">
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  );
}
