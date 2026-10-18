import { Link } from 'react-router';
import {
  daysBetween,
  formatAddress,
  formatAvailability,
  formatBaths,
  formatBeds,
  formatRent,
  formatSqft,
  type ListingSummary,
} from '@hearth/shared';
import { FavoriteButton } from './FavoriteButton';
import { ListingPhoto } from './illustrations/ListingPhoto';

interface ListingCardProps {
  listing: ListingSummary;
  today: string;
  highlighted?: boolean;
  onHover?: (id: number | null) => void;
  onFavoriteChange?: (isFavorite: boolean) => void;
}

const NEW_LISTING_DAYS = 3;

export function ListingCard({ listing, today, highlighted = false, onHover, onFavoriteChange }: ListingCardProps) {
  const isNew = daysBetween(listing.listedAt, today) <= NEW_LISTING_DAYS;
  const availableNow = listing.availableOn <= today;

  return (
    <article
      className={`listing-card${highlighted ? ' is-highlighted' : ''}`}
      onMouseEnter={() => onHover?.(listing.id)}
      onMouseLeave={() => onHover?.(null)}
    >
      <Link to={`/homes/${listing.id}`} className="listing-card__link">
        <div className="listing-card__media">
          <ListingPhoto listingId={listing.id} propertyType={listing.propertyType} className="listing-card__photo" />
          <div className="listing-card__badges">
            {isNew && <span className="badge badge--accent">New</span>}
            {availableNow && <span className="badge">Available now</span>}
          </div>
        </div>
        <div className="listing-card__body">
          <div className="listing-card__price">{formatRent(listing.rent)}</div>
          <div className="listing-card__facts">
            <span>{formatBeds(listing.beds)}</span>
            <span>{formatBaths(listing.baths)}</span>
            <span>{formatSqft(listing.sqft)}</span>
          </div>
          <div className="listing-card__address">{formatAddress(listing.address, listing.unit)}</div>
          <div className="listing-card__meta">
            {listing.neighborhood.name}
            {!availableNow && <> · {formatAvailability(listing.availableOn, today)}</>}
          </div>
        </div>
      </Link>
      <FavoriteButton
        listingId={listing.id}
        isFavorite={listing.isFavorite}
        className="listing-card__favorite"
        onChange={onFavoriteChange}
      />
    </article>
  );
}
