import { useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check, House, Menu, MessageSquarePlus } from 'lucide-react';

import AppLogo from '@components/AppLogo';
import SideSheet from '@components/SideSheet';
import { useAppCatalog } from '@hooks/useAppCatalog';
import { useAuth } from '@hooks/useAuth';
import { getAppResumePath } from '@lib/app';
import { useFeedbackSheet } from '@ui/feedback/feedbackSheetContext';
import IconTile from '@ui/IconTile';
import ThemePicker from '@ui/ThemePicker';

interface AppNavPanelProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

const rowClassName = (isCurrent: boolean) =>
  join(
    'text-foreground! h-14 w-full justify-start gap-3 rounded-xl px-2 text-left text-base font-normal',
    isCurrent && 'bg-primary/10 font-medium',
  );

/** The header's menu: a hamburger that slides in the list of apps (each opens where you last left it), Home, and the theme choice. */
function AppNavPanel({ isOpen, onOpenChange }: AppNavPanelProps) {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { apps } = useAppCatalog();
  const { open: openFeedback } = useFeedbackSheet();

  const isHome = pathname === '/';
  const currentApp =
    apps.find(
      (app) => pathname === app.path || pathname.startsWith(`${app.path}/`),
    ) ?? null;

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
        footer={<ThemePicker />}
      >
        {(close) => (
          <nav aria-label='Apps' className='space-y-4'>
            <ul>
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
                  <IconTile>
                    <House className='size-5' />
                  </IconTile>
                  <span className='min-w-0 flex-1 truncate'>Home</span>
                  {isHome && (
                    <Check className='text-primary h-5 w-5 shrink-0' />
                  )}
                </Button>
              </li>
            </ul>
            <div className='space-y-1'>
              <h3 className='text-foreground px-2 text-base font-semibold'>
                Your apps
              </h3>
              <ul className='divide-border/60 divide-y'>
                {apps.map((app) => {
                  const isCurrent = currentApp?.id === app.id;
                  const resumePath = getAppResumePath(
                    user?.uid ?? null,
                    app.id,
                    app.path,
                  );
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
                          goTo(
                            isCurrent ? app.path : resumePath,
                            !isCurrent && resumePath !== app.path,
                          );
                          close();
                        }}
                      >
                        <AppLogo
                          appId={app.id}
                          className='size-10 rounded-xl'
                        />
                        <span className='flex min-w-0 flex-1 flex-col'>
                          <span className='truncate'>{app.name}</span>
                          {canRestart && (
                            <span className='text-muted-foreground truncate text-xs'>
                              Back to start
                            </span>
                          )}
                        </span>
                        {isCurrent && (
                          <Check className='text-primary h-5 w-5 shrink-0' />
                        )}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
            {user ? (
              <ul>
                <li>
                  <Button
                    type='button'
                    variant='tertiary'
                    size='stripped'
                    className={rowClassName(false)}
                    onClick={() => {
                      close();
                      openFeedback(null);
                    }}
                  >
                    <IconTile>
                      <MessageSquarePlus className='size-5' />
                    </IconTile>
                    <span className='flex min-w-0 flex-1 flex-col'>
                      <span className='truncate'>Send feedback</span>
                      <span className='text-muted-foreground truncate text-xs'>
                        A bug, an idea or a question
                      </span>
                    </span>
                  </Button>
                </li>
              </ul>
            ) : null}
          </nav>
        )}
      </SideSheet>
    </>
  );
}

export default AppNavPanel;
