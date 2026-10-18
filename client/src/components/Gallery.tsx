import { useEffect, useState } from 'react';
import type { PropertyType } from '@hearth/shared';
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, PhotosIcon } from './Icons';
import { ListingPhoto, PHOTO_KINDS, PHOTO_LABELS } from './illustrations/ListingPhoto';

interface GalleryProps {
  listingId: number;
  propertyType: PropertyType;
  title: string;
}

/** Photo collage for the listing page with a full-screen viewer. */
export function Gallery({ listingId, propertyType, title }: GalleryProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <>
      <div className="gallery">
        {PHOTO_KINDS.map((kind, index) => (
          <button
            key={kind}
            type="button"
            className={`gallery__tile${index === 0 ? ' gallery__tile--main' : ''}`}
            onClick={() => setOpenIndex(index)}
            aria-label={`Open photo: ${PHOTO_LABELS[kind]}`}
          >
            <ListingPhoto listingId={listingId} propertyType={propertyType} kind={kind} />
          </button>
        ))}
        <button type="button" className="gallery__all" onClick={() => setOpenIndex(0)}>
          <PhotosIcon size={18} />
          View all {PHOTO_KINDS.length} photos
        </button>
      </div>
      {openIndex !== null && (
        <Lightbox
          listingId={listingId}
          propertyType={propertyType}
          title={title}
          index={openIndex}
          onIndexChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </>
  );
}

interface LightboxProps extends GalleryProps {
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

function Lightbox({ listingId, propertyType, title, index, onIndexChange, onClose }: LightboxProps) {
  const count = PHOTO_KINDS.length;
  const go = (delta: number) => onIndexChange((index + delta + count) % count);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') onIndexChange((index + 1) % count);
      if (event.key === 'ArrowLeft') onIndexChange((index - 1 + count) % count);
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('no-scroll');
    };
  }, [index, count, onClose, onIndexChange]);

  const kind = PHOTO_KINDS[index];
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={`Photos of ${title}`}>
      <div className="lightbox__bar">
        <span>{title}</span>
        <span className="lightbox__count">
          {index + 1} / {count}
        </span>
        <button type="button" className="icon-button icon-button--dark" onClick={onClose} aria-label="Close photos">
          <CloseIcon />
        </button>
      </div>
      {/* Clicking the dark area around the photo closes the viewer, like most photo viewers. */}
      <div
        className="lightbox__stage"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <button type="button" className="lightbox__nav" onClick={() => go(-1)} aria-label="Previous photo">
          <ChevronLeftIcon size={28} />
        </button>
        <figure className="lightbox__figure">
          <ListingPhoto listingId={listingId} propertyType={propertyType} kind={kind} />
          <figcaption>{PHOTO_LABELS[kind]}</figcaption>
        </figure>
        <button type="button" className="lightbox__nav" onClick={() => go(1)} aria-label="Next photo">
          <ChevronRightIcon size={28} />
        </button>
      </div>
      <div className="lightbox__thumbs">
        {PHOTO_KINDS.map((thumb, thumbIndex) => (
          <button
            key={thumb}
            type="button"
            className={thumbIndex === index ? 'is-current' : ''}
            onClick={() => onIndexChange(thumbIndex)}
            aria-label={PHOTO_LABELS[thumb]}
          >
            <ListingPhoto listingId={listingId} propertyType={propertyType} kind={thumb} />
          </button>
        ))}
      </div>
    </div>
  );
}
