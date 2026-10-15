import { useState, type ReactNode } from 'react';
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
import type { AppMetadata } from '@lib/types/appCatalog';

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

interface TriggerProps {
  onClick?: () => void;
  'aria-haspopup'?: 'dialog';
  'aria-expanded'?: boolean;
}

interface PhoneSheetProps {
  apps: AppMetadata[];
  currentAppId: string | null;
  isHome: boolean;
  onSelect: (path: string) => void;
  renderTrigger: (props: TriggerProps) => ReactNode;
}

/** Owns the open state, so rotating past `sm` and back never reopens a sheet nobody tapped. */
function PhoneSheet({ apps, currentAppId, isHome, onSelect, renderTrigger }: PhoneSheetProps) {
  const [isOpen, setIsOpen] = useState(false);

  const choose = (path: string) => {
    setIsOpen(false);
    onSelect(path);
  };

  const rowClassName = (isCurrent: boolean) =>
    join(
      'text-foreground! h-14 w-full justify-start gap-3 rounded-2xl border px-4 text-left text-base font-normal',
      isCurrent ? 'border-primary bg-primary/10' : 'border-border',
    );

  return (
    <>
      {renderTrigger({
        onClick: () => setIsOpen(true),
        'aria-haspopup': 'dialog',
        'aria-expanded': isOpen,
      })}
      <Drawer isOpen={isOpen} onClose={() => setIsOpen(false)} title='Apps' showCloseButton>
        <ul className='space-y-2 pb-4'>
          {apps.map((app) => {
            const isCurrent = currentAppId === app.id;

            return (
              <li key={app.id}>
                <Button
                  type='button'
                  variant='tertiary'
                  size='stripped'
                  aria-current={isCurrent ? 'page' : undefined}
                  className={rowClassName(isCurrent)}
                  onClick={() => choose(app.path)}
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
              onClick={() => choose('/')}
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

/** The header's app picker: shows the app you are in and jumps to another in two taps. A drawer on phones, a dropdown from `sm` up. */
function AppSwitcher() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { apps } = useAppCatalog();
  const isPhone = useMediaQuery().isBelow('sm');
  const { option, separator } = DropdownMenuFactories;

  if (apps.length === 0) {
    return null;
  }

  const isHome = pathname === '/';
  const currentApp =
    apps.find((app) => pathname === app.path || pathname.startsWith(`${app.path}/`)) ?? null;
  const label = currentApp?.name ?? (isHome ? 'Home' : 'Apps');

  const goTo = (path: string) => {
    if (path !== pathname) {
      navigate(path);
    }
  };

  const renderTrigger = (triggerProps: TriggerProps) => (
    <Button
      type='button'
      variant='base'
      size='sm'
      aria-label={`Switch app, now in ${label}`}
      className="relative min-w-0 gap-1.5 after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] min-[380px]:gap-2"
      {...triggerProps}
    >
      {currentApp ? (
        <AppLogo id={currentApp.id} className='size-5 rounded-md' />
      ) : isHome ? (
        <House className='size-4 shrink-0' />
      ) : (
        <LayoutGrid className='size-4 shrink-0' />
      )}
      <span className='min-w-0 truncate'>{label}</span>
      <ChevronDown className='size-4 shrink-0 max-[380px]:hidden' />
    </Button>
  );

  if (isPhone) {
    return (
      <PhoneSheet
        apps={apps}
        currentAppId={currentApp?.id ?? null}
        isHome={isHome}
        onSelect={goTo}
        renderTrigger={renderTrigger}
      />
    );
  }

  return (
    <DropdownMenu
      items={[
        ...apps.map((app) =>
          option({
            label: app.name,
            description: currentApp?.id === app.id ? 'You are here' : undefined,
            value: app.path,
            icon: <AppLogo id={app.id} className='size-5 rounded-md' />,
          }),
        ),
        separator(),
        option({
          label: 'Home',
          description: isHome ? 'You are here' : undefined,
          value: '/',
          icon: <House className='size-5' />,
        }),
      ]}
      onItemSelect={goTo}
      placement='bottom'
      alignment='center'
      offset={12}
      trigger={renderTrigger({})}
      className='w-64'
    />
  );
}

export default AppSwitcher;
