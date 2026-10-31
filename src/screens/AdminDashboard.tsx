import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useUnsavedWork } from '@/hooks/useUnsavedWork';
import AppLogo from '@/components/AppLogo';
import { SubviewBackButton } from '@/components/Subview';
import SectionHeader from '@/components/SectionHeader';
import StickyAppBar from '@/components/StickyAppBar';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import useNow from '@/hooks/useNow';
import { usePipelineSync } from '@/hooks/usePipelineSync';
import { useAppCatalog } from '@hooks/useAppCatalog';
import { useAuth } from '@hooks/useAuth';
import { adminUsersQueryOptions } from '@lib/admin/adminQueries';
import { ADMIN_EMAIL } from '@lib/app';
import type { AppMetadata, UserProfile } from '@lib/types/appCatalog';

import AdminRefreshButton from './admin/AdminRefreshButton';
import AppDetail from './admin/AppDetail';
import { isSameDraft, toDraft, type AppDraft } from './admin/appDraft';
import { CANVAS_CLASS, SURFACE_CLASS } from './admin/constants';
import DashboardNav from './admin/DashboardNav';
import FeedbackView from './admin/FeedbackView';
import FirebaseUsageView from './admin/FirebaseUsageView';
import MembersView from './admin/MembersView';
import PipelineSheet from './admin/PipelineSheet';
import PipelineView from './admin/PipelineView';
import { buildPipeline, getPipelineSummary } from './admin/pipelineUtils';
import { usePipelineAnswers } from './admin/usePipelineAnswers';
import { useAllAppUsage } from './admin/useAllAppUsage';
import { useDashboardUrlState } from './admin/useDashboardUrlState';

const NO_USERS: UserProfile[] = [];

/** An opaque bar in the canvas colour, so scrolled content never shows through it. */
const BAR_CLASS = 'bg-muted! dark:bg-background!';

/** The round back chip of the account page's header. */
function AdminDashboard() {
  const { user, isAdmin } = useAuth();
  const { allApps, updateAppMetadata } = useAppCatalog();
  const navigate = useNavigate();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const isWide = useMediaQuery().isAtLeast('lg');
  const url = useDashboardUrlState();
  const usersQuery = useQuery({
    ...adminUsersQueryOptions(),
    enabled: isAdmin,
  });
  const allUsage = useAllAppUsage(allApps);
  const [drafts, setDrafts] = useState<Record<string, AppDraft>>({});
  const users = usersQuery.data ?? NO_USERS;
  // Live, unlike the rest of the dashboard: the sessions change while the owner watches.
  const pipeline = usePipelineSync(isAdmin);
  const now = useNow(60_000);
  const pipelineGroups = buildPipeline(
    pipeline.sessions,
    pipeline.inbox,
    pipeline.answered,
    now,
  );
  const pipelineSummary = getPipelineSummary(pipelineGroups);
  const pipelineAnswers = usePipelineAnswers(pipelineGroups.waiting);
  const [openEntryKey, setOpenEntryKey] = useState<string | null>(null);
  const openEntry =
    pipelineGroups.waiting.find((entry) => entry.key === openEntryKey) ??
    [
      ...pipelineGroups.working,
      ...pipelineGroups.quiet,
      ...pipelineGroups.finished,
    ].find((entry) => entry.key === openEntryKey) ??
    null;

  const isMembersOpen = url.view === 'members';
  const isFirebaseOpen = url.view === 'firebase';
  const isFeedbackOpen = url.view === 'feedback';
  const chosenApp = allApps.find((app) => app.id === url.app);
  // A phone with nothing chosen shows the list, but the wide layout's main view is never empty: it opens on what waits on the owner.
  const isPipelineOpen =
    url.view === 'pipeline' ||
    (isWide &&
      !isMembersOpen &&
      !isFirebaseOpen &&
      !isFeedbackOpen &&
      !chosenApp);
  const selectedApp =
    isPipelineOpen || isMembersOpen || isFirebaseOpen || isFeedbackOpen
      ? undefined
      : chosenApp;
  const getSelected = () => {
    if (isPipelineOpen) return 'pipeline';
    if (isMembersOpen) return 'members';
    if (isFirebaseOpen) return 'firebase';
    if (isFeedbackOpen) return 'feedback';
    return selectedApp?.id ?? null;
  };
  const selected = getSelected();
  const getDetailTitle = () => {
    if (isPipelineOpen) return 'Pipeline';
    if (isFirebaseOpen) return 'Firebase usage';
    if (isFeedbackOpen) return 'Feedback';
    return selectedApp?.name ?? 'Members';
  };

  const getDraft = (app: AppMetadata) => drafts[app.id] ?? toDraft(app);
  const isDirty = (app: AppMetadata) =>
    !isSameDraft(getDraft(app), toDraft(app));
  useUnsavedWork(() => allApps.some(isDirty));

  const handleDraftChange = (app: AppMetadata, patch: Partial<AppDraft>) =>
    setDrafts((current) => ({
      ...current,
      [app.id]: { ...(current[app.id] ?? toDraft(app)), ...patch },
    }));

  const handleSaved = (appId: string) =>
    setDrafts((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([id]) => id !== appId),
      ),
    );

  const getPhoneDetail = () => {
    if (isPipelineOpen) return pipelineView;
    if (isMembersOpen) return members;
    if (isFirebaseOpen) return firebaseUsage;
    if (isFeedbackOpen) return feedback;
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
      isPipelineLoading={pipeline.isLoading}
      sessionsFailed={pipeline.sessionsFailed}
      inboxFailed={pipeline.inboxFailed}
      failedAppIds={allUsage.failedAppIds}
      selected={selected}
      unsavedAppIds={allApps.filter(isDirty).map((app) => app.id)}
      isWide={isWide}
      pipelineSummary={pipelineSummary}
      waitingEntries={pipelineGroups.waiting}
      onSelectPipeline={() => url.showPipeline({ isStep })}
      onAnswerEntry={setOpenEntryKey}
      onSelectFeedback={() => url.showFeedback({ isStep })}
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
  const pipelineView = (
    <PipelineView
      pipeline={pipeline}
      groups={pipelineGroups}
      now={now}
      answers={pipelineAnswers}
      onOpenEntry={setOpenEntryKey}
    />
  );
  const feedback = (
    <FeedbackView selectedId={url.feedback} onSelect={url.openFeedback} />
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

  const pipelineSheet = (
    <PipelineSheet
      entry={openEntry}
      onClose={() => setOpenEntryKey(null)}
      answers={pipelineAnswers}
    />
  );

  const homeButton = (
    <SubviewBackButton label='Back to home' onClick={() => navigate('/')} />
  );

  if (!isWide && selected !== null) {
    return (
      <div className={join('page', CANVAS_CLASS, 'pt-20')}>
        <div className='mx-auto w-full max-w-5xl space-y-4'>
          <StickyAppBar
            title=''
            className={BAR_CLASS}
            leading={
              <div className='flex min-w-0 flex-1 items-center gap-3'>
                <SubviewBackButton
                  label='Back to dashboard'
                  onClick={url.goBack}
                />
                {selectedApp ? (
                  <AppLogo
                    appId={selectedApp.id}
                    className='size-8 rounded-lg'
                  />
                ) : null}
                <h1 className='min-w-0 flex-1 truncate text-xl font-semibold tracking-tight'>
                  {getDetailTitle()}
                </h1>
              </div>
            }
            trailing={<AdminRefreshButton />}
          />
          {getPhoneDetail()}
        </div>
        {pipelineSheet}
      </div>
    );
  }

  const email = (
    <p className='text-muted-foreground mt-1 truncate text-sm'>{ADMIN_EMAIL}</p>
  );
  const eyebrow = (
    <p className='text-foreground/60 text-xs font-medium tracking-[0.24em] uppercase'>
      Admin
    </p>
  );
  const title = (
    <h1
      ref={titleRef}
      className='text-foreground min-w-0 truncate text-3xl font-semibold tracking-tight sm:text-4xl'
    >
      Dashboard
    </h1>
  );

  return (
    <div className={join('page', CANVAS_CLASS, 'pt-20')}>
      <div className='mx-auto w-full max-w-5xl space-y-6'>
        {isWide ? (
          <header>
            {eyebrow}
            <div className='mt-2 flex items-center gap-3'>
              {homeButton}
              {title}
              <span className='ml-auto'>
                <AdminRefreshButton />
              </span>
            </div>
            {email}
          </header>
        ) : (
          <>
            <StickyAppBar
              title='Dashboard'
              className={BAR_CLASS}
              titleRef={titleRef}
              leading={homeButton}
              trailing={<AdminRefreshButton />}
            />
            <header className='-mt-4'>
              {eyebrow}
              <div className='mt-2'>{title}</div>
              {email}
            </header>
          </>
        )}

        {isWide ? (
          <div className='grid grid-cols-[260px_1fr] gap-8'>
            <aside
              className={join(
                SURFACE_CLASS,
                'border-border/60 h-fit rounded-2xl border p-3 shadow-sm lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto',
              )}
            >
              {nav}
            </aside>
            <div className='min-w-0'>
              {isPipelineOpen ? (
                <div className='max-w-3xl space-y-4'>
                  <SectionHeader title='Pipeline' />
                  {pipelineView}
                </div>
              ) : isMembersOpen ? (
                <div className='max-w-3xl space-y-4'>
                  <SectionHeader title='Members' />
                  {members}
                </div>
              ) : isFeedbackOpen ? (
                <div className='max-w-3xl space-y-4'>
                  <SectionHeader title='Feedback' />
                  {feedback}
                </div>
              ) : isFirebaseOpen ? (
                <div className='max-w-3xl space-y-4'>
                  <SectionHeader title='Firebase usage' />
                  {firebaseUsage}
                </div>
              ) : (
                (appDetail ?? (
                  <p className='text-muted-foreground text-sm'>No apps yet.</p>
                ))
              )}
            </div>
          </div>
        ) : (
          nav
        )}
      </div>
      {pipelineSheet}
    </div>
  );
}

export default AdminDashboard;
