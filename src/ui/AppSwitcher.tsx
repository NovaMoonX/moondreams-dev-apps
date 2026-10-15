import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import {
  Button,
  Drawer,
  DropdownMenu,
  DropdownMenuFactories,
} from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check, ChevronDown, House, LayoutGrid } from 'lucide-react';

import FallbackImage from '@components/FallbackImage';
import { useAppCatalog } from '@hooks/useAppCatalog';
import { useMediaQuery } from '@hooks/useMediaQuery';
import { getRegistryAppForPath } from '@lib/app';

interface AppLogoProps {
  id: string;
  className: string;
}

function AppLogo({ id, className }: AppLogoProps) {
  return (
    <FallbackImage
      src={`/logos/by-app/logo-${id}.svg`}
      alt=''
      className={join('ring-foreground/15 shrink-0 ring-1', className)}
      fallback={<span className={join('bg-muted shrink-0', className)} />}
    />
  );
}

/** The header's app picker: shows the app you are in and jumps to another in two taps. A drawer on phones, a dropdown from `sm` up. */
function AppSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { apps } = useAppCatalog();
  const isPhone = useMediaQuery().isBelow('sm');
  const { option, separator } = DropdownMenuFactories;

  const isHome = pathname === '/';
  const currentApp =
    apps.find((app) => pathname === app.path || pathname.startsWith(`${app.path}/`)) ??
    getRegistryAppForPath(pathname);
  const label = currentApp?.name ?? 'Apps';

  const goTo = (path: string) => {
    setIsOpen(false);
    if (path !== pathname && !pathname.startsWith(`${path}/`)) {
      navigate(path);
    }
  };

  if (apps.length === 0) {
    return null;
  }

  const trigger = (
    <Button
      type='button'
      variant='base'
      size='sm'
      aria-label={`Switch app, now in ${label}`}
      className='min-w-0 gap-2'
      onClick={isPhone ? () => setIsOpen(true) : undefined}
    >
      {currentApp ? (
        <AppLogo id={currentApp.id} className='size-5 rounded-md' />
      ) : (
        <LayoutGrid className='size-4 shrink-0' />
      )}
      <span className='min-w-0 truncate'>{label}</span>
      <ChevronDown className='size-4 shrink-0' />
    </Button>
  );

  if (!isPhone) {
    return (
      <DropdownMenu
        items={[
          ...apps.map((app) =>
            option({
              label: app.name,
              value: app.path,
              icon:
                currentApp?.id === app.id ? (
                  <Check className='text-primary size-4' />
                ) : (
                  <AppLogo id={app.id} className='size-4 rounded' />
                ),
            }),
          ),
          separator(),
          option({
            label: 'Home',
            value: '/',
            icon: isHome ? (
              <Check className='text-primary size-4' />
            ) : (
              <House className='size-4' />
            ),
          }),
        ]}
        onItemSelect={goTo}
        placement='bottom'
        alignment='center'
        offset={12}
        trigger={trigger}
        className='w-64'
      />
    );
  }

  const rowClassName = (isCurrent: boolean) =>
    join(
      'text-foreground! h-14 w-full justify-start gap-3 rounded-2xl border px-4 text-left text-base font-normal',
      isCurrent ? 'border-primary bg-primary/10' : 'border-border',
    );

  return (
    <>
      {trigger}
      <Drawer
        isOpen={isOpen && isPhone}
        onClose={() => setIsOpen(false)}
        title='Apps'
        showCloseButton
      >
        <ul className='space-y-2 pb-4'>
          {apps.map((app) => {
            const isCurrent = currentApp?.id === app.id;

            return (
              <li key={app.id}>
                <Button
                  type='button'
                  variant='tertiary'
                  size='stripped'
                  aria-current={isCurrent ? 'page' : undefined}
                  className={rowClassName(isCurrent)}
                  onClick={() => goTo(app.path)}
                >
                  <AppLogo id={app.id} className='size-8 rounded-lg' />
                  <span className='min-w-0 flex-1 truncate'>{app.name}</span>
                  {isCurrent && <Check className='text-primary h-5 w-5 shrink-0' />}
                </Button>
              </li>
            );
          })}
          <li>
            <Button
              type='button'
              variant='tertiary'
              size='stripped'
              aria-current={isHome ? 'page' : undefined}
              className={rowClassName(isHome)}
              onClick={() => goTo('/')}
            >
              <span className='bg-muted grid size-8 shrink-0 place-items-center rounded-lg'>
                <House className='h-4 w-4' />
              </span>
              <span className='min-w-0 flex-1 truncate'>Home</span>
              {isHome && <Check className='text-primary h-5 w-5 shrink-0' />}
            </Button>
          </li>
        </ul>
      </Drawer>
    </>
  );
}

export default AppSwitcher;
