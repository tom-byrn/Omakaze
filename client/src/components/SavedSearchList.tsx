import { Link } from 'react-router';
import { ALERT_FREQUENCIES, filtersToSearchParams, type SavedSearch } from '@hearth/shared';
import { api } from '../api';
import { useAsync } from '../hooks/useAsync';
import { SearchIcon } from './Icons';

const searchUrl = (search: SavedSearch) => `/?${filtersToSearchParams({ ...search.criteria, page: 1 })}`;

export function SavedSearchList() {
  const { data: searches, setData } = useAsync((signal) => api.savedSearches(signal), []);

  const remove = async (id: number) => {
    await api.deleteSavedSearch(id);
    setData((current) => current?.filter((search) => search.id !== id));
  };

  if (!searches) return null;
  if (searches.length === 0) {
    return <p className="muted">No saved searches yet. Use “Save search” above the results to get alerts.</p>;
  }

  return (
    <ul className="saved-searches">
      {searches.map((search) => (
        <li key={search.id} className="card saved-search">
          <span className="saved-search__icon">
            <SearchIcon size={20} />
          </span>
          <div className="saved-search__body">
            <Link to={searchUrl(search)} className="saved-search__name">
              {search.name}
            </Link>
            <span className="muted">
              {search.matchCount} {search.matchCount === 1 ? 'home matches' : 'homes match'}
              {search.newCount > 0 && <strong className="saved-search__new"> · {search.newCount} new</strong>} · Alerts:{' '}
              {ALERT_FREQUENCIES[search.alertFrequency]}
            </span>
          </div>
          <Link to={searchUrl(search)} className="button button--secondary button--small">
            View results
          </Link>
          <button type="button" className="button button--ghost button--small" onClick={() => remove(search.id)}>
            Delete
          </button>
        </li>
      ))}
    </ul>
  );
}
