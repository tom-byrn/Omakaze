import { Link } from 'react-router';
import { EmptyState } from '../components/EmptyState';
import { HomeIcon } from '../components/Icons';
import { useDocumentTitle } from '../hooks/misc';

export function NotFoundPage({ title = 'We couldn’t find that page' }: { title?: string }) {
  useDocumentTitle('Not found');
  return (
    <div className="container page">
      <EmptyState
        icon={<HomeIcon size={28} />}
        title={title}
        action={
          <Link to="/" className="button button--primary">
            Back to search
          </Link>
        }
      >
        It may have been rented, or the link might be mistyped.
      </EmptyState>
    </div>
  );
}
