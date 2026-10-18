import { Link } from 'react-router';
import { formatCurrency, formatDate, type SaleDetail } from '@hearth/shared';

/** The buying call to action at the top of a sale listing's sidebar. */
export function OfferCard({ listing }: { listing: SaleDetail }) {
  const agent = listing.agent.name.split(' ')[0];
  const copy = {
    active: ['Interested in this home?', `Make an offer in a few minutes and ${agent} will present it to the sellers.`],
    pending: ['Under contract', 'The sellers have accepted an offer. Save the home in case it comes back on the market.'],
    sold: ['Sold', `This home sold for ${formatCurrency(listing.soldPrice ?? listing.listPrice)} on ${formatDate(listing.soldOn ?? listing.listedAt)}.`],
  }[listing.status];

  return (
    <div className="card offer-card">
      <h3>{copy[0]}</h3>
      <p>{copy[1]}</p>
      {listing.status === 'active' && (
        <Link to={`/homes/${listing.id}/offer`} className="button button--primary button--large button--block">
          Make an offer
        </Link>
      )}
      {listing.status !== 'sold' && (
        <a href="#tour" className="button button--secondary button--block">
          Request a tour
        </a>
      )}
    </div>
  );
}
