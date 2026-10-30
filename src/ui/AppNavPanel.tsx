import { useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check, House, Menu } from 'lucide-react';

import AppLogo from '@components/AppLogo';
import SideSheet from '@components/SideSheet';
import { useAppCatalog } from '@hooks/useAppCatalog';
import { useAuth } from '@hooks/useAuth';
import { getAppResumePath } from '@lib/app';
import ThemeToggle from '@ui/ThemeToggle';

interface AppNavPanelProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
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

  const here = `${pathname}${search}`;
  const goTo = (path: string, isResume = false) => {
    if (path !== here) {
      navigate(path, { state: isResume ? { resumed: true } : null });
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
        className='-ml-2.5 h-10 w-10 p-0'
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
                const resumePath = getAppResumePath(user?.uid ?? null, app.id, app.path);
                const canRestart = isCurrent && here !== app.path;

                return (
                  <li key={app.id}>
                    <Button
                      type='button'
                      variant='tertiary'
                      size='stripped'
                      aria-current={isCurrent ? 'page' : undefined}
                      className={rowClassName(isCurrent)}
                      onClick={() => {
                        goTo(isCurrent ? app.path : resumePath, !isCurrent && resumePath !== app.path);
                        close();
                      }}
                    >
                      <AppLogo appId={app.id} />
                      <span className='flex min-w-0 flex-1 flex-col'>
                        <span className='truncate'>{app.name}</span>
                        {canRestart && <span className='text-muted-foreground truncate text-xs'>Back to start</span>}
                      </span>
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
