import { Link } from 'react-router';
import { api } from '../api';
import { EmptyState } from '../components/EmptyState';
import { Footer } from '../components/Footer';
import { HeartIcon } from '../components/Icons';
import { ListingCard } from '../components/ListingCard';
import { useDocumentTitle, useToday } from '../hooks/misc';
import { useAsync } from '../hooks/useAsync';

export function SavedPage() {
  const today = useToday();
  const { data: favorites, error, setData } = useAsync((signal) => api.favorites(signal), []);
  useDocumentTitle('Saved homes');

  const removeFromList = (id: number) =>
    setData((current) => current?.filter((listing) => listing.id !== id));

  return (
    <>
      <div className="container page">
        <header className="page-header">
          <h1>Saved homes</h1>
          <p>Homes you’ve saved on this device. Tap the heart on any listing to add or remove it.</p>
        </header>

        {error && <div className="notice notice--error">We couldn’t load your saved homes. {error.message}</div>}

        {favorites && favorites.length === 0 && (
          <EmptyState
            icon={<HeartIcon size={28} />}
            title="No saved homes yet"
            action={
              <Link to="/" className="button button--primary">
                Browse rentals
              </Link>
            }
          >
            Save homes while you search and they’ll show up here, ready to compare.
          </EmptyState>
        )}

        {favorites && favorites.length > 0 && (
          <div className="listing-grid listing-grid--wide">
            {favorites.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                today={today}
                onFavoriteChange={(saved) => !saved && removeFromList(listing.id)}
              />
            ))}
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}
