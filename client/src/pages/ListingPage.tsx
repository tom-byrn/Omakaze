import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import {
  LAUNDRY_LABELS,
  PARKING_LABELS,
  PET_POLICY_LABELS,
  PROPERTY_TYPE_LABELS,
  formatAddress,
  formatAvailability,
  formatCurrency,
  formatDate,
  formatListedAgo,
  formatListingPrice,
  formatNumber,
  type RentalDetail,
} from '@hearth/shared';
import { ApiError, api } from '../api';
import { ContactForm } from '../components/ContactForm';
import { FavoriteButton } from '../components/FavoriteButton';
import { Footer } from '../components/Footer';
import { Gallery } from '../components/Gallery';
import { AreaIcon, BathIcon, BedIcon, CalendarIcon, CarIcon, CheckIcon, PawIcon, WasherIcon } from '../components/Icons';
import { useDocumentTitle, useToday } from '../hooks/misc';
import { useAsync } from '../hooks/useAsync';
import { useNeighborhoods } from '../hooks/useNeighborhoods';
import { MapView } from '../map/MapView';
import { NotFoundPage } from './NotFoundPage';

export function ListingPage() {
  const params = useParams();
  const listingId = Number(params.id);
  const today = useToday();
  const neighborhoods = useNeighborhoods();
  const { data: listing, error } = useAsync((signal) => api.listing(listingId, signal), [listingId]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [listingId]);

  const title = listing ? formatAddress(listing.address, listing.unit) : null;
  useDocumentTitle(title);

  if (error instanceof ApiError && error.status === 404) {
    return <NotFoundPage title="This home isn’t listed anymore" />;
  }
  if (error) {
    return (
      <div className="container page">
        <div className="notice notice--error">We couldn’t load this home. {error.message}</div>
      </div>
    );
  }
  if (!listing || listing.id !== listingId || !title) {
    return <div className="page-loading" aria-busy="true" />;
  }

  const neighborhood = neighborhoods.find((hood) => hood.slug === listing.neighborhood.slug);
  const facts = listing.listingType === 'rent' ? rentalFacts(listing, today) : [];
  const highlights = listing.listingType === 'rent' ? rentalHighlights(listing, today) : [];

  return (
    <>
      <div className="container listing-page">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link to="/">Rentals</Link>
          <span aria-hidden="true">/</span>
          <Link to={`/?neighborhood=${listing.neighborhood.slug}`}>{listing.neighborhood.name}</Link>
          <span aria-hidden="true">/</span>
          <span>{title}</span>
        </nav>

        <Gallery listingId={listing.id} propertyType={listing.propertyType} title={title} />

        <div className="listing-layout">
          <div className="listing-main">
            <section className="listing-summary">
              <div className="listing-summary__top">
                <div>
                  <div className="listing-price">{formatListingPrice(listing)}</div>
                  <ul className="key-stats">
                    <li>
                      <BedIcon />
                      <strong>{listing.beds === 0 ? 'Studio' : listing.beds}</strong>
                      {listing.beds > 0 && (listing.beds === 1 ? ' bed' : ' beds')}
                    </li>
                    <li>
                      <BathIcon />
                      <strong>{listing.baths}</strong> {listing.baths === 1 ? 'bath' : 'baths'}
                    </li>
                    <li>
                      <AreaIcon />
                      <strong>{formatNumber(listing.sqft)}</strong> sqft
                    </li>
                  </ul>
                </div>
                <FavoriteButton listingId={listing.id} isFavorite={listing.isFavorite} variant="labeled" />
              </div>
              <h1 className="listing-address">{title}</h1>
              <p className="listing-location">
                {listing.neighborhood.name}, Port Ellis · {PROPERTY_TYPE_LABELS[listing.propertyType]}
              </p>
            </section>

            <ul className="highlights">
              {highlights.map((item) => (
                <li key={item.label}>
                  {item.icon}
                  {item.label}
                </li>
              ))}
            </ul>

            <section className="listing-section">
              <h2>About this home</h2>
              <p className="listing-description">{listing.description}</p>
            </section>

            <section className="listing-section">
              <h2>Facts</h2>
              <dl className="facts-grid">
                {facts.map((fact) => (
                  <div key={fact.label}>
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            {listing.amenities.length > 0 && (
              <section className="listing-section">
                <h2>Amenities</h2>
                <ul className="amenities">
                  {listing.amenities.map((amenity) => (
                    <li key={amenity}>
                      <CheckIcon size={18} />
                      {amenity}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="listing-section">
              <h2>Location</h2>
              <div className="listing-map">
                <MapView
                  markers={[{ id: listing.id, location: listing.location, label: formatListingPrice(listing) }]}
                  interactive={false}
                  initialCenter={listing.location}
                  initialZoom={2.6}
                  highlight={listing.neighborhood.slug}
                  variant="pin"
                />
              </div>
              {neighborhood && (
                <div className="neighborhood-blurb">
                  <h3>{neighborhood.name}</h3>
                  <p className="neighborhood-blurb__tagline">{neighborhood.tagline}</p>
                  <p>{neighborhood.description}</p>
                </div>
              )}
            </section>
          </div>

          <aside className="listing-aside">
            <ContactForm listing={listing} />
          </aside>
        </div>
      </div>
      <Footer />
    </>
  );
}

function rentalFacts(listing: RentalDetail, today: string) {
  return [
    { label: 'Property type', value: PROPERTY_TYPE_LABELS[listing.propertyType] },
    { label: 'Available', value: listing.availableOn <= today ? 'Now' : formatDate(listing.availableOn) },
    { label: 'Lease term', value: `${listing.leaseTermMonths} months` },
    { label: 'Security deposit', value: formatCurrency(listing.deposit) },
    { label: 'Size', value: `${formatNumber(listing.sqft)} sqft` },
    { label: 'Listed', value: formatListedAgo(listing.listedAt, today) },
  ];
}

function rentalHighlights(listing: RentalDetail, today: string) {
  return [
    { icon: <PawIcon />, label: PET_POLICY_LABELS[listing.pets] },
    { icon: <WasherIcon />, label: LAUNDRY_LABELS[listing.laundry] },
    { icon: <CarIcon />, label: PARKING_LABELS[listing.parking] },
    { icon: <CalendarIcon />, label: formatAvailability(listing.availableOn, today) },
  ];
}
