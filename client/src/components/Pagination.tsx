import { ChevronLeftIcon, ChevronRightIcon } from './Icons';

interface PaginationProps {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}

/** Page numbers with the ends and the pages around the current one; gaps become "…". */
export function pageItems(page: number, pageCount: number): (number | 'gap')[] {
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const items: (number | 'gap')[] = [];
  sorted.forEach((p, index) => {
    if (index > 0 && p - sorted[index - 1] > 1) items.push('gap');
    items.push(p);
  });
  return items;
}

export function Pagination({ page, pageCount, onChange }: PaginationProps) {
  if (pageCount <= 1) return null;

  return (
    <nav className="pagination" aria-label="Pagination">
      <button type="button" className="pagination__step" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeftIcon size={16} />
        Previous
      </button>
      <ol className="pagination__pages">
        {pageItems(page, pageCount).map((item, index) =>
          item === 'gap' ? (
            <li key={`gap-${index}`} className="pagination__gap">
              …
            </li>
          ) : (
            <li key={item}>
              <button
                type="button"
                className={item === page ? 'is-current' : ''}
                aria-current={item === page ? 'page' : undefined}
                onClick={() => onChange(item)}
              >
                {item}
              </button>
            </li>
          ),
        )}
      </ol>
      <button
        type="button"
        className="pagination__step"
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
      >
        Next
        <ChevronRightIcon size={16} />
      </button>
    </nav>
  );
}
