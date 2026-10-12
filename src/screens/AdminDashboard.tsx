import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import SectionHeader from '@/components/SectionHeader';
import { SubviewHeader } from '@/components/Subview';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import NavButton from '@/ui/NavButton';
import { useAppCatalog } from '@hooks/useAppCatalog';
import { useAuth } from '@hooks/useAuth';
import { adminUsersQueryOptions } from '@lib/admin/adminQueries';
import { ADMIN_EMAIL } from '@lib/app';
import type { AppMetadata, UserProfile } from '@lib/types/appCatalog';

import AdminRefreshButton from './admin/AdminRefreshButton';
import AppDetail from './admin/AppDetail';
import { isSameDraft, toDraft, type AppDraft } from './admin/appDraft';
import DashboardNav from './admin/DashboardNav';
import MembersView from './admin/MembersView';
import { useAllAppUsage } from './admin/useAllAppUsage';
import { useDashboardUrlState } from './admin/useDashboardUrlState';

const NO_USERS: UserProfile[] = [];

function AdminDashboard() {
  const { user, isAdmin } = useAuth();
  const { allApps, updateAppMetadata } = useAppCatalog();
  const isWide = useMediaQuery().isAtLeast('lg');
  const url = useDashboardUrlState();
  const usersQuery = useQuery({ ...adminUsersQueryOptions(), enabled: isAdmin });
  const allUsage = useAllAppUsage(allApps);
  const [drafts, setDrafts] = useState<Record<string, AppDraft>>({});
  const users = usersQuery.data ?? NO_USERS;

  const isMembersOpen = url.view === 'members';
  // The wide layout always shows something in the main view; a phone shows the list until one is chosen.
  const selectedApp = isMembersOpen
    ? undefined
    : (allApps.find((app) => app.id === url.app) ?? (isWide ? allApps[0] : undefined));
  const selected = isMembersOpen ? 'members' : (selectedApp?.id ?? null);

  const getDraft = (app: AppMetadata) => drafts[app.id] ?? toDraft(app);
  const isDirty = (app: AppMetadata) => !isSameDraft(getDraft(app), toDraft(app));

  const handleDraftChange = (app: AppMetadata, patch: Partial<AppDraft>) =>
    setDrafts((current) => ({ ...current, [app.id]: { ...(current[app.id] ?? toDraft(app)), ...patch } }));

  const handleSaved = (appId: string) =>
    setDrafts((current) =>
      Object.fromEntries(Object.entries(current).filter(([id]) => id !== appId)),
    );

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
      selected={selected}
      unsavedAppIds={allApps.filter(isDirty).map((app) => app.id)}
      isWide={isWide}
      onSelectMembers={() => url.showMembers({ isStep })}
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

  if (!isWide && selected !== null) {
    return (
      <div className='page pt-20'>
        <div className='mx-auto w-full max-w-5xl space-y-4'>
          <div className='flex items-center gap-2'>
            <SubviewHeader
              title={selectedApp?.name ?? 'Members'}
              onBack={url.goBack}
              className='mb-0 min-w-0 flex-1'
            />
            <AdminRefreshButton />
          </div>
          {isMembersOpen ? members : appDetail}
        </div>
      </div>
    );
  }

  return (
    <div className='page pt-20'>
      <div className='mx-auto w-full max-w-5xl space-y-6'>
        <header className='flex items-center justify-between gap-4'>
          <div className='min-w-0'>
            <p className='text-foreground/60 text-xs font-medium tracking-[0.24em] uppercase'>
              Admin
            </p>
            <h1 className='text-foreground mt-2 text-4xl font-semibold tracking-tight'>
              Dashboard
            </h1>
            <p className='text-muted-foreground mt-1 truncate text-sm'>{ADMIN_EMAIL}</p>
          </div>
          <div className='flex shrink-0 gap-2'>
            <AdminRefreshButton />
            <NavButton href='/' variant='outline'>
              Back
            </NavButton>
          </div>
        </header>

        {isWide ? (
          <div className='grid grid-cols-[260px_1fr] gap-8'>
            <aside className='border-border bg-card h-fit rounded-2xl border p-3'>{nav}</aside>
            <div className='min-w-0'>
              {isMembersOpen ? (
                <div className='max-w-3xl space-y-4'>
                  <SectionHeader title='Members' />
                  {members}
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
