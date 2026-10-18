import { useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check, House, Menu } from 'lucide-react';

import FallbackImage from '@components/FallbackImage';
import SideSheet from '@components/SideSheet';
import { useAppCatalog } from '@hooks/useAppCatalog';
import { useAuth } from '@hooks/useAuth';
import { getAppResumePath } from '@lib/app';
import ThemeToggle from '@ui/ThemeToggle';

interface AppNavPanelProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

function AppLogo({ id }: { id: string }) {
  return (
    <FallbackImage
      src={`/logos/by-app/logo-${id}.svg`}
      alt=''
      className='ring-foreground/15 size-8 shrink-0 rounded-lg ring-1'
      fallback={<span className='bg-muted size-8 shrink-0 rounded-lg' />}
    />
  );
}

const rowClassName = (isCurrent: boolean) =>
  join(
    'text-foreground! h-14 w-full justify-start gap-3 rounded-2xl border px-3 text-left text-base font-normal',
    isCurrent ? 'border-primary bg-primary/10' : 'border-border',
  );

/** The header's menu: a hamburger that slides in the list of apps (each opens where you last left it), Home, and the theme switch. */
function AppNavPanel({ isOpen, onOpenChange }: AppNavPanelProps) {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { apps } = useAppCatalog();

  const isHome = pathname === '/';
  const currentApp =
    apps.find((app) => pathname === app.path || pathname.startsWith(`${app.path}/`)) ?? null;

  const goTo = (path: string) => {
    if (path !== `${pathname}${search}`) {
      navigate(path);
    }
  };

  return (
    <>
      <Button
        type='button'
        variant='base'
        size='sm'
        aria-label='Open menu'
        aria-haspopup='dialog'
        aria-expanded={isOpen}
        className='h-10 w-10 p-0'
        onClick={() => onOpenChange(true)}
      >
        <Menu className='h-5 w-5' />
      </Button>
      <SideSheet
        isOpen={isOpen}
        onClose={() => onOpenChange(false)}
        title='Apps'
        footer={
          <div className='flex items-center justify-between gap-3'>
            <span className='text-foreground text-base'>Dark mode</span>
            <ThemeToggle />
          </div>
        }
      >
        {(close) => (
          <nav aria-label='Apps'>
            <ul className='space-y-2'>
              <li>
                <Button
                  type='button'
                  variant='tertiary'
                  size='stripped'
                  aria-current={isHome ? 'page' : undefined}
                  className={rowClassName(isHome)}
                  onClick={() => {
                    goTo('/');
                    close();
                  }}
                >
                  <span className='bg-muted grid size-8 shrink-0 place-items-center rounded-lg'>
                    <House className='h-4 w-4' />
                  </span>
                  <span className='min-w-0 flex-1 truncate'>Home</span>
                  {isHome && <Check className='text-primary h-5 w-5 shrink-0' />}
                </Button>
              </li>
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
                      onClick={() => {
                        goTo(isCurrent ? app.path : getAppResumePath(user?.uid ?? null, app.id, app.path));
                        close();
                      }}
                    >
                      <AppLogo id={app.id} />
                      <span className='min-w-0 flex-1 truncate'>{app.name}</span>
                      {isCurrent && <Check className='text-primary h-5 w-5 shrink-0' />}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </SideSheet>
    </>
  );
}

export default AppNavPanel;
