import SectionDivider from '@/components/SectionDivider';
import { TabPanel, UnderlineTabs } from '@/components/UnderlineTabs';
import type { AppMetadata, UserProfile } from '@lib/types/appCatalog';

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

/** One app: Usage and Settings stacked under its name on a wide screen, and one tab bar between them on a phone. */
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

  if (isWide) {
    return (
      <div className='max-w-3xl space-y-6'>
        <div>
          <h2 className='text-foreground text-2xl font-semibold'>{app.name}</h2>
          <p className='text-muted-foreground text-sm'>/{app.path.replace(/^\//, '') || app.id}</p>
        </div>
        <section className='space-y-4'>
          <SectionDivider label='Usage' />
          {usage}
        </section>
        <section className='space-y-4'>
          <SectionDivider label='Settings' trailing={isDirty ? <span className='text-muted-foreground text-xs'>unsaved</span> : null} />
          {settings}
        </section>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <UnderlineTabs
        value={section}
        onChange={onSectionChange}
        tabs={[
          { value: 'usage', label: 'Usage' },
          { value: 'settings', label: isDirty ? 'Settings •' : 'Settings' },
        ]}
      />
      <TabPanel value='usage' activeValue={section}>
        {usage}
      </TabPanel>
      <TabPanel value='settings' activeValue={section}>
        {settings}
      </TabPanel>
    </div>
  );
}

export default AppDetail;
