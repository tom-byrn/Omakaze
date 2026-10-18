import { Link } from 'react-router';
import { formatAddress, formatBaths, formatBeds, formatRent, type ListingSummary } from '@hearth/shared';
import { api } from '../api';
import { useAsync } from '../hooks/useAsync';
import { ListingPhoto } from './illustrations/ListingPhoto';

interface MapPopupCardProps {
  listingId: number;
  /** The listing, when it is already loaded (e.g. on the current results page). */
  listing?: ListingSummary;
}

export function MapPopupCard({ listingId, listing }: MapPopupCardProps) {
  const { data } = useAsync<ListingSummary>(
    (signal) => (listing ? Promise.resolve(listing) : api.listing(listingId, signal)),
    [listingId, listing],
  );

  if (!data) {
    return <div className="map-popup-card map-popup-card--loading">Loading…</div>;
  }

  return (
    <Link to={`/homes/${data.id}`} className="map-popup-card">
      <ListingPhoto listingId={data.id} propertyType={data.propertyType} className="map-popup-card__photo" />
      <div className="map-popup-card__body">
        <strong>{formatRent(data.rent)}</strong>
        <span>
          {formatBeds(data.beds)} · {formatBaths(data.baths)}
        </span>
        <span className="map-popup-card__address">{formatAddress(data.address, data.unit)}</span>
      </div>
    </Link>
  );
}
