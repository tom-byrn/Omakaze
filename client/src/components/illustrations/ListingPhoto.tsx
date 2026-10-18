import { memo, useId, useMemo } from 'react';
import type { PropertyType } from '@hearth/shared';
import { exteriorScene } from './exterior';
import { bedroom, kitchen, livingRoom } from './interior';
import { Rng, seedFrom } from './random';
import { streetScene } from './street';

export const PHOTO_KINDS = ['front', 'living', 'kitchen', 'bedroom', 'street'] as const;

export type PhotoKind = (typeof PHOTO_KINDS)[number];

export const PHOTO_LABELS: Record<PhotoKind, string> = {
  front: 'Front of the home',
  living: 'Living room',
  kitchen: 'Kitchen',
  bedroom: 'Bedroom',
  street: 'The street',
};

interface ListingPhotoProps {
  listingId: number;
  propertyType: PropertyType;
  kind?: PhotoKind;
  className?: string;
  title?: string;
}

/**
 * A procedurally drawn "photo" of a listing. The same listing id and kind
 * always produce the same picture, so cards, galleries and the map popup agree.
 */
export const ListingPhoto = memo(function ListingPhoto({
  listingId,
  propertyType,
  kind = 'front',
  className,
  title,
}: ListingPhotoProps) {
  const uid = `p${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const scene = useMemo(() => {
    const rng = new Rng(seedFrom('hearth', listingId, kind));
    switch (kind) {
      case 'living':
        return livingRoom(rng, uid);
      case 'kitchen':
        return kitchen(rng, uid);
      case 'bedroom':
        return bedroom(rng, uid);
      case 'street':
        return streetScene(rng, uid);
      default:
        return exteriorScene(rng, uid, propertyType);
    }
  }, [listingId, propertyType, kind, uid]);

  return (
    <svg
      className={className}
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={title ?? PHOTO_LABELS[kind]}
    >
      {scene}
    </svg>
  );
});
