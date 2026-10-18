import { useEffect, useState, type MouseEvent } from 'react';
import { api } from '../api';
import { HeartIcon } from './Icons';

interface FavoriteButtonProps {
  listingId: number;
  isFavorite: boolean;
  /** "icon" floats over a photo; "labeled" is a regular button with text. */
  variant?: 'icon' | 'labeled';
  className?: string;
  onChange?: (isFavorite: boolean) => void;
}

export function FavoriteButton({
  listingId,
  isFavorite,
  variant = 'icon',
  className = '',
  onChange,
}: FavoriteButtonProps) {
  const [saved, setSaved] = useState(isFavorite);
  const [pending, setPending] = useState(false);

  useEffect(() => setSaved(isFavorite), [isFavorite]);

  const toggle = async (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const next = !saved;
    setSaved(next);
    setPending(true);
    try {
      if (next) await api.addFavorite(listingId);
      else await api.removeFavorite(listingId);
      onChange?.(next);
    } catch {
      setSaved(!next);
    } finally {
      setPending(false);
    }
  };

  const label = saved ? 'Saved' : 'Save';
  return (
    <button
      type="button"
      className={`favorite-button favorite-button--${variant}${saved ? ' is-saved' : ''} ${className}`}
      onClick={toggle}
      disabled={pending}
      aria-pressed={saved}
      aria-label={variant === 'icon' ? (saved ? 'Remove from saved homes' : 'Save this home') : undefined}
    >
      <HeartIcon filled={saved} size={variant === 'icon' ? 20 : 18} />
      {variant === 'labeled' && <span>{label}</span>}
    </button>
  );
}
