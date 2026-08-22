import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { DevAccountSwitcher } from '@components/DevAccountSwitcher';
import { useAuth } from '@hooks/useAuth';
import AuthAvatar from '@ui/AuthAvatar';
import ThemeToggle from '@ui/ThemeToggle';

function LocationSync() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setCurrentLocation } = useAuth();

  useEffect(() => {
    if (!location.pathname) {
      navigate('/');
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
  }, [navigate, location.pathname, setCurrentLocation]);

  return null;
}

function Layout() {
  return (
    <div className='transition-colors duration-200'>
      <LocationSync />

      {/* header */}
      <div className='pointer-events-none absolute inset-x-0 top-0 z-10 flex h-20 items-center justify-between px-4 py-4 md:px-6'>
        <div className='pointer-events-auto'>
          <ThemeToggle className='flex items-center' />
        </div>

        <div className='pointer-events-auto'>
          <AuthAvatar />
        </div>

        <div className='pointer-events-auto absolute left-1/2 -translate-x-1/2'>
          <DevAccountSwitcher />
        </div>
      </div>

      <Outlet />
    </div>
  );
}

export default Layout;
