import { useEffect, useLayoutEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import { getRegistryAppForPath, SITE_VERSION } from '@/lib/app';
import { DevAccountSwitcher } from '@components/DevAccountSwitcher';
import { EmulatorStatus } from '@components/EmulatorStatus';
import { useAuth } from '@hooks/useAuth';
import { useHideOnScroll } from '@hooks/useHideOnScroll';
import { useNetworkStatus } from '@hooks/useNetworkStatus';
import { useReminderToasts } from '@hooks/useReminderToasts';
import PostLoginRedirectHandler from '@routes/PostLoginRedirectHandler';
import AuthAvatar from '@ui/AuthAvatar';
import OfflineBanner from '@ui/OfflineBanner';
import ThemeToggle from '@ui/ThemeToggle';

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
              .replace(/^(a-list\/shared)\/.*$/, '$1');

      setCurrentLocation(nextLocation);
    }

    handleSetCurrentLocation(location.pathname);
  }, [navigate, location.pathname, setCurrentLocation, user]);

  // Only mini-apps have a manifest; the hub and other pages carry none, so they can't be installed.
  useEffect(() => {
    const app = getRegistryAppForPath(location.pathname);
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');

    if (!app) {
      link?.remove();
    } else {
      const manifestPath = `/manifest-${app.id}.json`;
      const manifestLink = link ?? document.createElement('link');
      manifestLink.rel = 'manifest';
      if (manifestLink.getAttribute('href') !== manifestPath) {
        manifestLink.setAttribute('href', manifestPath);
      }
      if (!manifestLink.isConnected) {
        document.head.appendChild(manifestLink);
      }
    }

    document.title = location.pathname.startsWith('/a-list/shared/')
      ? 'Movie calendar - A-List Tracker'
      : app ? `${app.name} - Moondreams Dev Apps` : 'Moondreams Dev Apps';
  }, [location.pathname]);

  return null;
}

function Layout() {
  const networkStatus = useNetworkStatus();
  const isBannerVisible = networkStatus !== null;
  const isHeaderHidden = useHideOnScroll();

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
        className={join(
          'pointer-events-none fixed inset-x-0 z-30 flex h-20 items-center gap-3 px-4 py-4 max-md:h-16 max-md:py-2 transition-[top] duration-300 max-md:pointer-events-auto max-md:bg-background/80 max-md:backdrop-blur md:absolute md:px-6',
          isBannerVisible ? 'top-9' : 'top-0',
          isHeaderHidden && (isBannerVisible ? 'max-md:-top-7' : 'max-md:-top-16'),
        )}
      >
        <div className='pointer-events-auto flex flex-1 items-center justify-start'>
          <ThemeToggle className='flex items-center' />
        </div>

        <div className='pointer-events-auto flex flex-1 items-center justify-center'>
          <DevAccountSwitcher />
        </div>

        <div className='pointer-events-auto flex flex-1 items-center justify-end'>
          <AuthAvatar />
        </div>
      </div>

      <Outlet />
    </div>
  );
}

export default Layout;
