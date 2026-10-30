import { useEffect, useLayoutEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import { getRegistryAppForPath, rememberAppLocation, SITE_VERSION } from '@/lib/app';
import { DevAccountSwitcher } from '@components/DevAccountSwitcher';
import { EmulatorStatus } from '@components/EmulatorStatus';
import { useAuth } from '@hooks/useAuth';
import { useHideOnScroll } from '@hooks/useHideOnScroll';
import { useNetworkStatus } from '@hooks/useNetworkStatus';
import { useReminderToasts } from '@hooks/useReminderToasts';
import { useSwipeRight } from '@hooks/useSwipeRight';
import { useUpdateReady } from '@hooks/useUpdateReady';
import PostLoginRedirectHandler from '@routes/PostLoginRedirectHandler';
import AppNavPanel from '@ui/AppNavPanel';
import AuthAvatar from '@ui/AuthAvatar';
import OfflineBanner from '@ui/OfflineBanner';

/** A link's page never names what it shows: its title is the same for every link. */
const getPageTitle = (pathname: string, appName: string | null) => {
  if (pathname.startsWith('/a-list/shared/')) {
    return 'Movie calendar - A-List Tracker';
  }
  if (pathname.startsWith('/pinch/shared/')) return 'Shared on Pinch';
  return appName ? `${appName} - Moondreams Dev Apps` : 'Moondreams Dev Apps';
};

function LocationSync() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, setCurrentLocation } = useAuth();

  // Sync the user's current location with their status in the Realtime
  // Database. `setCurrentLocation` no-ops if auth hasn't resolved yet, so
  // `user` must also be a dependency — otherwise a deep link/refresh that
  // renders before auth resolves silently skips the write and never
  // retries (pathname doesn't change again), leaving presence stale.
  useEffect(() => {
    if (!location.pathname) {
      navigate('/');
      return;
    }

    if (!user) {
      return;
    }

    function handleSetCurrentLocation(locationPathname: string) {
      // remove any leading slashes and replace with 'home' if the path is just '/'.
      // A link's secret token must never reach presence: that tree is world-readable.
      const nextLocation =
        locationPathname === '/'
          ? 'home'
          : locationPathname
              .replace(/^\/+/, '')
              .replace(/^((?:a-list|pinch)\/shared)\/.*$/, '$1');

      setCurrentLocation(nextLocation);
    }

    handleSetCurrentLocation(location.pathname);
  }, [navigate, location.pathname, setCurrentLocation, user]);

  useEffect(() => {
    if (user) {
      rememberAppLocation(user.uid, location.pathname, location.search);
    }
  }, [user, location.pathname, location.search]);

  // The hub's manifest (index.html) is the only one, so the site installs as a single app; each app only gets its own tab icon and title.
  useEffect(() => {
    const app = getRegistryAppForPath(location.pathname);

    document
      .querySelectorAll<HTMLLinkElement>('link[rel="icon"]')
      .forEach((icon) => {
        icon.dataset.defaultHref ??= icon.getAttribute('href') ?? '';
        icon.setAttribute(
          'href',
          app ? `/logos/by-app/logo-${app.id}.svg` : icon.dataset.defaultHref,
        );
      });

    document.title = getPageTitle(location.pathname, app?.name ?? null);
  }, [location.pathname]);

  return null;
}

function Layout() {
  const networkStatus = useNetworkStatus();
  const isUpdateReady = useUpdateReady();
  const isBannerVisible = networkStatus !== null || isUpdateReady;
  const isHeaderHidden = useHideOnScroll();
  const { key: locationKey } = useLocation();
  const [navOpenKey, setNavOpenKey] = useState<string | null>(null);
  // Tied to the location it was opened on, so Back or any navigation closes it.
  const isNavOpen = navOpenKey === locationKey;
  const swipeToOpen = useSwipeRight(() => setNavOpenKey(locationKey));

  useLayoutEffect(() => {
    document.documentElement.dataset.siteHeader = isHeaderHidden ? 'hidden' : 'visible';
    document.documentElement.dataset.siteBanner = String(isBannerVisible);
  }, [isHeaderHidden, isBannerVisible]);
  useReminderToasts();

  useEffect(() => {
    console.log(`MoonDreams Dev Apps v${SITE_VERSION}`);
  }, []);

  return (
    <div className='transition-colors duration-200'>
      <LocationSync />
      <PostLoginRedirectHandler />

      <OfflineBanner />
      <EmulatorStatus />

      {/* header — shifted down while the offline banner occupies the top of the screen; pinned on mobile only, where it slides away while scrolling down and returns on the way up */}
      <div
        data-site-chrome=''
        className={join(
          'pointer-events-none fixed inset-x-0 z-30 flex h-20 items-center gap-3 px-4 max-[380px]:gap-2 py-4 max-md:h-16 max-md:py-2 transition-[top] duration-300 max-md:pointer-events-auto max-md:bg-background/80 max-md:backdrop-blur md:absolute md:px-6',
          isBannerVisible ? 'top-9' : 'top-0',
          isHeaderHidden && (isBannerVisible ? 'max-md:-top-7' : 'max-md:-top-16'),
        )}
        {...swipeToOpen}
      >
        <div className='pointer-events-auto flex min-w-20 flex-1 basis-0 items-center justify-start'>
          <AppNavPanel
            isOpen={isNavOpen}
            onOpenChange={(isOpen) => setNavOpenKey(isOpen ? locationKey : null)}
          />
        </div>

        <div className='pointer-events-auto flex min-w-0 items-center justify-center gap-2'>
          <DevAccountSwitcher />
        </div>

        <div className='pointer-events-auto flex min-w-20 flex-1 basis-0 items-center justify-end'>
          <AuthAvatar />
        </div>
      </div>

      <Outlet />
    </div>
  );
}

export default Layout;
