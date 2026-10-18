import { Link, NavLink } from 'react-router';
import { HeartIcon, PinIcon } from './Icons';
import { LogoMark } from './Logo';

export function Header() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link to="/" className="brand" aria-label="Hearth home">
          <LogoMark />
          <span className="brand__name">Hearth</span>
        </Link>

        <nav className="site-nav" aria-label="Main">
          <NavLink to="/" end className="site-nav__link">
            Rentals
          </NavLink>
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
