import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import AppToggle from '@/components/AppToggle';
import SectionDivider from '@/components/SectionDivider';
import SectionHeader from '@/components/SectionHeader';
import { useAuth } from '@/hooks/useAuth';
import { useLocalStoragePreference } from '@/hooks/useLocalStoragePreference';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useAppCatalog } from '@hooks/useAppCatalog';
import { APP_DESCRIPTION, APP_TITLE, getAppResumePath } from '@lib/app';
import type { AppMetadata } from '@lib/types/appCatalog';

import AppCard from './home/AppCard';
import AppInfoDrawer from './home/AppInfoDrawer';
import AppTile from './home/AppTile';

function Home() {
  const { user } = useAuth();
  const { apps, loading, starredAppIds, setAppStarred } = useAppCatalog();
  const navigate = useNavigate();
  const isWide = useMediaQuery().isAtLeast('sm');
  const [isShowingDetails, setIsShowingDetails] = useLocalStoragePreference('home:show-app-details', false);
  const [infoAppId, setInfoAppId] = useState<string | null>(null);
  const isGrid = !isWide && !isShowingDetails;
  const infoApp = apps.find((app) => app.id === infoAppId) ?? null;
  const starredApps = apps.filter((app) => starredAppIds.includes(app.id));
  const groups =
    starredApps.length > 0
      ? [
          { label: 'Starred', apps: starredApps },
          { label: 'All apps', apps: apps.filter((app) => !starredAppIds.includes(app.id)) },
        ]
      : [{ label: null, apps }];

  // Starring only matters once there is something to put first.
  const isHintShown = isGrid && user !== null && apps.length > 1 && starredApps.length === 0;

  const getHref = (app: AppMetadata) => getAppResumePath(user?.uid ?? null, app.id, app.path);
  const toggleStar = (appId: string) =>
    setAppStarred(appId, !starredAppIds.includes(appId)).catch((error) =>
      console.error('Failed to star app:', error),
    );

  return (
    <div className='page flex items-center justify-center'>
      <div className='w-full max-w-4xl'>
        <header className='mb-10 flex items-center justify-center'>
          <div className='text-foreground/60 text-xs font-medium tracking-[0.24em] uppercase'>
            {APP_TITLE}
          </div>
        </header>

        <main className='space-y-6 text-center'>
          <h1 className='text-foreground text-4xl font-semibold tracking-tight md:text-6xl'>
            For <span className='px-1 font-serif italic'>some</span> moment.
          </h1>
          <p className='text-foreground/70 mx-auto max-w-xl text-base md:text-lg'>
            {APP_DESCRIPTION}
          </p>
        </main>

        {loading ? (
          <div className='text-foreground/60 mt-12 text-center text-sm'>
            Loading apps...
          </div>
        ) : apps.length === 0 ? (
          <div className='border-border bg-card text-foreground/70 mx-auto mt-12 max-w-2xl rounded-3xl border px-5 py-4 text-center text-sm'>
            {user
              ? 'No apps available for your account.'
              : 'No apps generally available. Please sign in to see apps available for your account.'}
          </div>
        ) : (
          <section className='mt-12 space-y-4 text-left'>
            {!isWide ? (
              <SectionHeader
                title='Your apps'
                subtitle={isHintShown ? 'Press and hold an app to star it, or turn on Details.' : undefined}
                action={
                  isWide ? null : (
                    <div className='flex items-center gap-2'>
                      <span className='text-muted-foreground text-sm'>Details</span>
                      <AppToggle
                        size='sm'
                        aria-label='Show details'
                        className="after:absolute after:-inset-x-2.5 after:-inset-y-2.5 after:content-['']"
                        checked={isShowingDetails}
                        onCheckedChange={setIsShowingDetails}
                      />
                    </div>
                  )
                }
              />
            ) : null}
            {groups.map((group) => (
              <div key={group.label ?? 'all'} className='space-y-3'>
                {group.label ? <SectionDivider label={group.label} /> : null}
                {isGrid ? (
                  <nav aria-label={group.label ?? 'Apps'} className='grid grid-cols-3 gap-x-2 gap-y-4 min-[360px]:grid-cols-4'>
                    {group.apps.map((app) => (
                      <AppTile
                        key={app.id}
                        app={app}
                        href={getHref(app)}
                        isStarred={starredAppIds.includes(app.id)}
                        onShowInfo={() => setInfoAppId(app.id)}
                      />
                    ))}
                  </nav>
                ) : (
                  <nav aria-label={group.label ?? 'Apps'} className='grid gap-4 sm:grid-cols-2'>
                    {group.apps.map((app) => (
                      <AppCard
                        key={app.id}
                        app={app}
                        href={getHref(app)}
                        isStarred={starredAppIds.includes(app.id)}
                        onToggleStar={user ? () => toggleStar(app.id) : null}
                      />
                    ))}
                  </nav>
                )}
              </div>
            ))}
          </section>
        )}
      </div>
      <AppInfoDrawer
        app={infoApp}
        isStarred={infoApp !== null && starredAppIds.includes(infoApp.id)}
        onOpen={() => {
          if (infoApp === null) return;
          setInfoAppId(null);
          navigate(getHref(infoApp), { state: { resumed: true } });
        }}
        onToggleStar={user && infoApp !== null ? () => toggleStar(infoApp.id) : null}
        onClose={() => setInfoAppId(null)}
      />
    </div>
  );
}

export default Home;
