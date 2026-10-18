import { Route, Routes } from 'react-router';
import { Header } from './components/Header';
import { ListingPage } from './pages/ListingPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SavedPage } from './pages/SavedPage';
import { SearchPage } from './pages/SearchPage';

export function App() {
  return (
    <div className="app">
      <Header />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/homes/:id" element={<ListingPage />} />
          <Route path="/saved" element={<SavedPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  );
}
