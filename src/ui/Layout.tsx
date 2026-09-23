import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import { APP_REGISTRY_PATH_MAP } from '@/lib/app';
import { DevAccountSwitcher } from '@components/DevAccountSwitcher';
import { useAuth } from '@hooks/useAuth';
import { useNetworkStatus } from '@hooks/useNetworkStatus';
import { useReminderToasts } from '@hooks/useReminderToasts';
import PostLoginRedirectHandler from '@routes/PostLoginRedirectHandler';
import AuthAvatar from '@ui/AuthAvatar';
import OfflineBanner from '@ui/OfflineBanner';
import ThemeToggle from '@ui/ThemeToggle';
import VersionBadge from '@ui/VersionBadge';

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
      // remove any leading slashes and replace with 'home' if the path is just '/'
      const nextLocation =
        locationPathname === '/'
          ? 'home'
          : locationPathname.replace(/^\/+/, '');

      setCurrentLocation(nextLocation);
    }

    handleSetCurrentLocation(location.pathname);
  }, [navigate, location.pathname, setCurrentLocation, user]);

  // Sync the manifest file based on the current location
  useEffect(() => {
    let manifestPath = '/manifest-main.json';
    let appName = 'Moondreams Dev Apps';

    const appRegistry = APP_REGISTRY_PATH_MAP[location.pathname] || null;
    if (appRegistry) {
      manifestPath = `/manifest-${appRegistry.id}.json`;
      appName = `${appRegistry.name} - Moondreams Dev Apps`;
    }

    // Update the manifest link in the document head
    let link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      document.head.appendChild(link);
    }

    // Only update if changed to avoid unnecessary DOM mutations
    if (link.getAttribute('href') !== manifestPath) {
      link.setAttribute('href', manifestPath);
    }


    // Update the document title based on the current app
    document.title = appName;
  }, [location.pathname]);

  return null;
}

function Layout() {
  const networkStatus = useNetworkStatus();
  const isBannerVisible = networkStatus !== null;
  useReminderToasts();

  return (
    <div className='transition-colors duration-200'>
      <LocationSync />
      <PostLoginRedirectHandler />

      <OfflineBanner />

      {/* header — shifted down while the offline banner occupies the top of the screen */}
      <div
        className={join(
          'pointer-events-none absolute inset-x-0 z-10 flex h-20 items-center gap-3 px-4 py-4 transition-[top] duration-300 md:px-6',
          isBannerVisible ? 'top-9' : 'top-0',
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

      <VersionBadge />
    </div>
  );
}

export default Layout;
