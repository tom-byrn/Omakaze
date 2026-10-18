import { useState } from 'react';
import { Link } from 'react-router';
import {
  CONTINGENCY_OPTIONS,
  FINANCING_OPTIONS,
  OPEN_OFFER_STATUSES,
  formatAddress,
  formatCurrency,
  formatDate,
  formatPercent,
  type OfferWithListing,
} from '@hearth/shared';
import { api } from '../api';
import { EmptyState } from '../components/EmptyState';
import { Footer } from '../components/Footer';
import { HomeIcon } from '../components/Icons';
import { ListingPhoto } from '../components/illustrations/ListingPhoto';
import { OfferStatusBadge } from '../components/offers/OfferStatusBadge';
import { useDocumentTitle } from '../hooks/misc';
import { useAsync } from '../hooks/useAsync';

export function OffersPage() {
  useDocumentTitle('My offers');
  const { data: offers, error, setData } = useAsync((signal) => api.offers(signal), []);

  const replace = (updated: OfferWithListing) =>
    setData((current) => current?.map((offer) => (offer.id === updated.id ? updated : offer)));

  const count = (statuses: string[]) => offers?.filter((offer) => statuses.includes(offer.status)).length ?? 0;
  const tiles = [
    { label: 'Open offers', value: count([...OPEN_OFFER_STATUSES]) },
    { label: 'Waiting on you', value: count(['countered']) },
    { label: 'Accepted', value: count(['accepted']) },
  ];

  return (
    <>
      <div className="container page">
        <header className="page-header">
          <h1>My offers</h1>
          <p>Track the offers you’ve made and respond to sellers.</p>
        </header>

        {error && <div className="notice notice--error">We couldn’t load your offers. {error.message}</div>}

        {offers && offers.length === 0 && (
          <EmptyState
            icon={<HomeIcon size={28} />}
            title="You haven’t made any offers yet"
            action={
              <Link to="/?type=sale" className="button button--primary">
                Browse homes for sale
              </Link>
            }
          >
            When you find the one, use “Make an offer” on its listing page.
          </EmptyState>
        )}

        {offers && offers.length > 0 && (
          <>
            <div className="stat-grid stat-grid--three">
              {tiles.map((tile) => (
                <div key={tile.label} className="stat-tile">
                  <div className="stat-tile__label">{tile.label}</div>
                  <div className="stat-tile__value">{tile.value}</div>
                </div>
              ))}
            </div>
            <div className="offer-list">
              {offers.map((offer) => (
                <OfferRow key={offer.id} offer={offer} onChange={replace} />
              ))}
            </div>
          </>
        )}
      </div>
      <Footer />
    </>
  );
}

function OfferRow({ offer, onChange }: { offer: OfferWithListing; onChange: (offer: OfferWithListing) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const { listing } = offer;
  const open = OPEN_OFFER_STATUSES.includes(offer.status);

  const withdraw = async () => {
    setBusy(true);
    try {
      onChange({ ...(await api.withdrawOffer(offer.id)), listing });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <article className="card offer-row">
      <Link to={`/homes/${listing.id}`} className="offer-row__photo" aria-label={listing.address}>
        <ListingPhoto listingId={listing.id} propertyType={listing.propertyType} />
      </Link>

      <div className="offer-row__body">
        <div className="offer-row__head">
          <Link to={`/homes/${listing.id}`} className="offer-row__address">
            {formatAddress(listing.address, listing.unit)}
          </Link>
          <OfferStatusBadge status={offer.status} />
        </div>
        <p className="muted">
          {listing.neighborhood.name} · Asking {formatCurrency(listing.listPrice)} · Offer sent {formatDate(offer.createdAt.slice(0, 10))}
        </p>
        <dl className="offer-row__terms">
          <div>
            <dt>Your offer</dt>
            <dd>
              {formatCurrency(offer.amount)} <span className="muted">({formatPercent(offer.amount / listing.listPrice)})</span>
            </dd>
          </div>
          <div>
            <dt>Financing</dt>
            <dd>
              {FINANCING_OPTIONS[offer.financing].label}
              {offer.financing !== 'cash' && `, ${offer.downPaymentPercent}% down`}
            </dd>
          </div>
          <div>
            <dt>Closing</dt>
            <dd>{formatDate(offer.closingDate)}</dd>
          </div>
          <div>
            <dt>Contingencies</dt>
            <dd>{offer.contingencies.map((c) => CONTINGENCY_OPTIONS[c].label).join(', ') || 'None'}</dd>
          </div>
        </dl>
        {offer.counterAmount !== null && offer.status === 'countered' && (
          <div className="offer-row__note offer-row__note--counter">
            <strong>The sellers countered at {formatCurrency(offer.counterAmount)}</strong>
            {offer.sellerNote && <p>{offer.sellerNote}</p>}
          </div>
        )}
        {offer.status !== 'countered' && offer.sellerNote && <div className="offer-row__note">{offer.sellerNote}</div>}
      </div>

      <div className="offer-row__actions">
        {open &&
          (confirming ? (
            <>
              <button type="button" className="button button--danger button--small" onClick={withdraw} disabled={busy}>
                {busy ? 'Withdrawing…' : 'Yes, withdraw'}
              </button>
              <button type="button" className="button button--ghost button--small" onClick={() => setConfirming(false)}>
                Keep offer
              </button>
            </>
          ) : (
            <button type="button" className="button button--secondary button--small" onClick={() => setConfirming(true)}>
              Withdraw
            </button>
          ))}
        <Link to={`/homes/${listing.id}`} className="button button--ghost button--small">
          View home
        </Link>
      </div>
    </article>
  );
}
