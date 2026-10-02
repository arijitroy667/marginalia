import { Link, NavLink, Outlet } from 'react-router';
import { ThemeMenu } from '../features/theme/ThemeMenu';
import { en } from '../shared/i18n/en';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 items-center rounded-md px-3 text-sm ${isActive ? 'font-semibold text-ui-fg' : 'text-muted hover:text-ui-fg'}`;

/** App chrome for library/settings; the reader route has its own full-screen chrome. */
export function Shell() {
  return (
    <div className="flex h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded bg-accent px-3 py-2 text-accent-fg focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
      >
        {en.app.skipToContent}
      </a>
      <header className="flex items-center gap-2 border-b border-line bg-surface px-4 pt-[env(safe-area-inset-top)]">
        <Link to="/" className="mr-2 flex min-h-11 items-center font-semibold">
          {en.app.name}
        </Link>
        <nav aria-label={en.app.nav.main} className="flex gap-1">
          <NavLink to="/" end className={navClass}>
            {en.app.nav.library}
          </NavLink>
          <NavLink to="/settings" className={navClass}>
            {en.app.nav.settings}
          </NavLink>
        </nav>
        <div className="ml-auto">
          <ThemeMenu />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="min-h-0 flex-1 overflow-auto pb-[env(safe-area-inset-bottom)]">
        <Outlet />
      </main>
    </div>
  );
}
