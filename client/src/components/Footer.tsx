import { Link } from 'react-router';
import { LogoMark } from './Logo';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div className="site-footer__brand">
          <LogoMark size={24} />
          <span>Hearth</span>
        </div>
        <p className="site-footer__note">
          Homes in Port Ellis. Every listing, person and place on Hearth is fictional.
        </p>
        <nav className="site-footer__links" aria-label="Footer">
          <Link to="/">Rentals</Link>
          <Link to="/saved">Saved homes</Link>
        </nav>
      </div>
    </footer>
  );
}
