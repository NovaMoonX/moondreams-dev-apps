import AppLogo from '@/components/AppLogo';
import { TabPanel, UnderlineTabs } from '@/components/UnderlineTabs';
import type { AppMetadata, UserProfile } from '@lib/types/appCatalog';

import { getAppFeatureGates } from '@lib/gates/gates.registry';

import AppFeaturesTab from './AppFeaturesTab';
import type { AppDraft } from './appDraft';
import AppSettingsTab from './AppSettingsTab';
import AppUsageTab from './AppUsageTab';
import type { DashboardSection } from './useDashboardUrlState';

interface AppDetailProps {
  app: AppMetadata;
  users: UserProfile[];
  isUsersLoading: boolean;
  isUsersError: boolean;
  draft: AppDraft;
  isDirty: boolean;
  onDraftChange: (patch: Partial<AppDraft>) => void;
  onSave: (appId: string, payload: Partial<AppMetadata>) => Promise<void>;
  onSaved: () => void;
  section: DashboardSection;
  onSectionChange: (section: DashboardSection) => void;
  isWide: boolean;
}

function AppDetail({
  app,
  users,
  isUsersLoading,
  isUsersError,
  draft,
  isDirty,
  onDraftChange,
  onSave,
  onSaved,
  section,
  onSectionChange,
  isWide,
}: AppDetailProps) {
  const usage = (
    <AppUsageTab
      key={app.id}
      app={app}
      users={users}
      isUsersLoading={isUsersLoading}
      isUsersError={isUsersError}
    />
  );
  const settings = (
    <AppSettingsTab
      key={app.id}
      app={app}
      draft={draft}
      isDirty={isDirty}
      users={users}
      onDraftChange={onDraftChange}
      onSave={onSave}
      onSaved={onSaved}
    />
  );

  const hasFeatures = getAppFeatureGates(app.id).length > 0;
  const features = <AppFeaturesTab key={app.id} app={app} users={users} />;

  if (isWide) {
    return (
      <div className='max-w-3xl space-y-8'>
        <div className='flex items-center gap-3'>
          <AppLogo appId={app.id} className='size-12 rounded-xl' />
          <div className='min-w-0'>
            <h2 className='text-foreground text-2xl font-semibold'>
              {app.name}
            </h2>
            <p className='text-muted-foreground text-sm'>
              /{app.path.replace(/^\//, '') || app.id}
            </p>
          </div>
        </div>
        <section className='space-y-4'>
          <h3 className='text-foreground text-lg font-semibold'>Usage</h3>
          {usage}
        </section>
        <section className='space-y-4'>
          <div className='flex items-baseline justify-between gap-3'>
            <h3 className='text-foreground text-lg font-semibold'>Settings</h3>
            {isDirty ? (
              <span className='text-muted-foreground text-xs'>unsaved</span>
            ) : null}
          </div>
          {settings}
        </section>
        {hasFeatures ? (
          <section className='space-y-4'>
            <h3 className='text-foreground text-lg font-semibold'>Features</h3>
            {features}
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      <UnderlineTabs
        value={section}
        onChange={onSectionChange}
        tabs={[
          { value: 'usage', label: 'Usage' },
          { value: 'settings', label: isDirty ? 'Settings •' : 'Settings' },
          ...(hasFeatures ? [{ value: 'features' as const, label: 'Features' }] : []),
        ]}
      />
      <TabPanel value='usage' activeValue={section}>
        {usage}
      </TabPanel>
      <TabPanel value='settings' activeValue={section}>
        {settings}
      </TabPanel>
      <TabPanel value='features' activeValue={section}>
        {features}
      </TabPanel>
    </div>
  );
}

export default AppDetail;
