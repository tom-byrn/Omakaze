import { Link, NavLink, useLocation, useSearchParams } from 'react-router';
import type { ListingType } from '@hearth/shared';
import { useListingType } from '../hooks/useListingType';
import { HeartIcon, PinIcon } from './Icons';
import { LogoMark } from './Logo';

export function Header() {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const remembered = useListingType();
  const current: ListingType | null =
    pathname === '/' ? (searchParams.get('type') === 'sale' ? 'sale' : 'rent') : pathname.startsWith('/homes/') ? remembered : null;

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link to="/" className="brand" aria-label="Hearth home">
          <LogoMark />
          <span className="brand__name">Hearth</span>
        </Link>

        <div className="type-toggle" role="group" aria-label="Rent or buy">
          <Link to="/" className={current === 'rent' ? 'is-selected' : ''} aria-current={current === 'rent' ? 'page' : undefined}>
            Rent
          </Link>
          <Link
            to="/?type=sale"
            className={current === 'sale' ? 'is-selected' : ''}
            aria-current={current === 'sale' ? 'page' : undefined}
          >
            Buy
          </Link>
        </div>

        <nav className="site-nav" aria-label="Main">
          <NavLink to="/saved" className="site-nav__link">
            <HeartIcon size={17} />
            Saved homes
          </NavLink>
        </nav>

        <div className="site-header__city">
          <PinIcon size={16} />
          Port Ellis, WA
        </div>
      </div>
    </header>
  );
}
