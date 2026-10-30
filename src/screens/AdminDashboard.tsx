import { useQuery } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import AppLogo from '@/components/AppLogo';
import HeaderIconButton from '@/components/HeaderIconButton';
import SectionHeader from '@/components/SectionHeader';
import StickyAppBar from '@/components/StickyAppBar';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useAppCatalog } from '@hooks/useAppCatalog';
import { useAuth } from '@hooks/useAuth';
import { adminUsersQueryOptions } from '@lib/admin/adminQueries';
import { ADMIN_EMAIL } from '@lib/app';
import type { AppMetadata, UserProfile } from '@lib/types/appCatalog';

import AdminRefreshButton from './admin/AdminRefreshButton';
import AppDetail from './admin/AppDetail';
import { isSameDraft, toDraft, type AppDraft } from './admin/appDraft';
import DashboardNav from './admin/DashboardNav';
import FirebaseUsageView from './admin/FirebaseUsageView';
import MembersView from './admin/MembersView';
import { useAllAppUsage } from './admin/useAllAppUsage';
import { useDashboardUrlState } from './admin/useDashboardUrlState';

const NO_USERS: UserProfile[] = [];

function AdminDashboard() {
  const { user, isAdmin } = useAuth();
  const { allApps, updateAppMetadata } = useAppCatalog();
  const navigate = useNavigate();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const isWide = useMediaQuery().isAtLeast('lg');
  const url = useDashboardUrlState();
  const usersQuery = useQuery({ ...adminUsersQueryOptions(), enabled: isAdmin });
  const allUsage = useAllAppUsage(allApps);
  const [drafts, setDrafts] = useState<Record<string, AppDraft>>({});
  const users = usersQuery.data ?? NO_USERS;

  const isMembersOpen = url.view === 'members';
  const isFirebaseOpen = url.view === 'firebase';
  // A phone with no app chosen shows the list, but the wide layout's main view is never empty.
  const selectedApp =
    isMembersOpen || isFirebaseOpen
      ? undefined
      : (allApps.find((app) => app.id === url.app) ?? (isWide ? allApps[0] : undefined));
  const getSelected = () => {
    if (isMembersOpen) return 'members';
    if (isFirebaseOpen) return 'firebase';
    return selectedApp?.id ?? null;
  };
  const selected = getSelected();
  const getDetailTitle = () => {
    if (isFirebaseOpen) return 'Firebase usage';
    return selectedApp?.name ?? 'Members';
  };

  const getDraft = (app: AppMetadata) => drafts[app.id] ?? toDraft(app);
  const isDirty = (app: AppMetadata) => !isSameDraft(getDraft(app), toDraft(app));

  const handleDraftChange = (app: AppMetadata, patch: Partial<AppDraft>) =>
    setDrafts((current) => ({ ...current, [app.id]: { ...(current[app.id] ?? toDraft(app)), ...patch } }));

  const handleSaved = (appId: string) =>
    setDrafts((current) =>
      Object.fromEntries(Object.entries(current).filter(([id]) => id !== appId)),
    );

  const getPhoneDetail = () => {
    if (isMembersOpen) return members;
    if (isFirebaseOpen) return firebaseUsage;
    return appDetail;
  };

  if (!user || !isAdmin) {
    return null;
  }

  const isStep = !isWide && selected === null;
  const nav = (
    <DashboardNav
      apps={allApps}
      users={users}
      usageByAppId={allUsage.byAppId}
      isLoading={usersQuery.isPending || allUsage.isLoading}
      isUsersError={usersQuery.isError}
      failedAppIds={allUsage.failedAppIds}
      selected={selected}
      unsavedAppIds={allApps.filter(isDirty).map((app) => app.id)}
      isWide={isWide}
      onSelectMembers={() => url.showMembers({ isStep })}
      onSelectFirebase={() => url.showFirebase({ isStep })}
      onSelectApp={(appId) => url.showApp(appId, { isStep })}
    />
  );
  const members = (
    <MembersView
      apps={allApps}
      users={users}
      isUsersLoading={usersQuery.isPending}
      isUsersError={usersQuery.isError}
      selectedUid={url.member}
      onSelectMember={url.openMember}
    />
  );
  const firebaseUsage = <FirebaseUsageView apps={allApps} />;
  const appDetail = selectedApp ? (
    <AppDetail
      app={selectedApp}
      users={users}
      isUsersLoading={usersQuery.isPending}
      isUsersError={usersQuery.isError}
      draft={getDraft(selectedApp)}
      isDirty={isDirty(selectedApp)}
      onDraftChange={(patch) => handleDraftChange(selectedApp, patch)}
      onSave={updateAppMetadata}
      onSaved={() => handleSaved(selectedApp.id)}
      section={url.section}
      onSectionChange={url.setSection}
      isWide={isWide}
    />
  ) : null;

  const homeButton = (
    <HeaderIconButton icon={<ChevronLeft className='size-4' />} label='Back to home' onClick={() => navigate('/')} />
  );

  if (!isWide && selected !== null) {
    return (
      <div className='page pt-20'>
        <div className='mx-auto w-full max-w-5xl space-y-4'>
          <StickyAppBar
            title=''
            leading={
              <div className='flex min-w-0 flex-1 items-center gap-3'>
                <HeaderIconButton icon={<ChevronLeft className='size-4' />} label='Back to dashboard' onClick={url.goBack} />
                {selectedApp ? <AppLogo appId={selectedApp.id} className='size-8 rounded-lg' /> : null}
                <h1 className='min-w-0 flex-1 truncate text-xl font-semibold tracking-tight'>{getDetailTitle()}</h1>
              </div>
            }
            trailing={<AdminRefreshButton />}
          />
          {getPhoneDetail()}
        </div>
      </div>
    );
  }

  const heading = (
    <div className='min-w-0'>
      <p className='text-foreground/60 text-xs font-medium tracking-[0.24em] uppercase'>Admin</p>
      <h1 ref={titleRef} className='text-foreground mt-2 text-3xl font-semibold tracking-tight sm:text-4xl'>
        Dashboard
      </h1>
      <p className='text-muted-foreground mt-1 truncate text-sm'>{ADMIN_EMAIL}</p>
    </div>
  );

  return (
    <div className='page pt-20'>
      <div className='mx-auto w-full max-w-5xl space-y-6'>
        {isWide ? (
          <header className='flex items-start justify-between gap-4'>
            <div className='flex min-w-0 items-start gap-3'>
              <span className='mt-1'>{homeButton}</span>
              {heading}
            </div>
            <span className='mt-1'>
              <AdminRefreshButton />
            </span>
          </header>
        ) : (
          <header className='space-y-2'>
            <StickyAppBar title='Dashboard' titleRef={titleRef} leading={homeButton} trailing={<AdminRefreshButton />} />
            {heading}
          </header>
        )}

        {isWide ? (
          <div className='grid grid-cols-[260px_1fr] gap-8'>
            <aside className='border-border bg-card h-fit rounded-2xl border p-3 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto'>
              {nav}
            </aside>
            <div className='min-w-0'>
              {isMembersOpen ? (
                <div className='max-w-3xl space-y-4'>
                  <SectionHeader title='Members' />
                  {members}
                </div>
              ) : isFirebaseOpen ? (
                <div className='max-w-3xl space-y-4'>
                  <SectionHeader title='Firebase usage' />
                  {firebaseUsage}
                </div>
              ) : (
                (appDetail ?? <p className='text-muted-foreground text-sm'>No apps yet.</p>)
              )}
            </div>
          </div>
        ) : (
          nav
        )}
      </div>
    </div>
  );
}

export default AdminDashboard;
