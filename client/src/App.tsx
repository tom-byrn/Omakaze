import { Route, Routes } from 'react-router';
import { Header } from './components/Header';
import { AffordabilityPage } from './pages/AffordabilityPage';
import { ListingTypeProvider } from './hooks/useListingType';
import { ListingPage } from './pages/ListingPage';
import { MakeOfferPage } from './pages/MakeOfferPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OffersPage } from './pages/OffersPage';
import { SavedPage } from './pages/SavedPage';
import { SearchPage } from './pages/SearchPage';

export function App() {
  return (
    <ListingTypeProvider>
      <div className="app">
        <Header />
        <main className="app-main">
          <Routes>
            <Route path="/" element={<SearchPage />} />
            <Route path="/homes/:id" element={<ListingPage />} />
            <Route path="/homes/:id/offer" element={<MakeOfferPage />} />
            <Route path="/offers" element={<OffersPage />} />
            <Route path="/affordability" element={<AffordabilityPage />} />
            <Route path="/saved" element={<SavedPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
      </div>
    </ListingTypeProvider>
  );
}
