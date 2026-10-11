import { Select } from '@moondreamsdev/dreamer-ui/components';
import { useState } from 'react';

import { TabPanel, UnderlineTabs } from '@/components/UnderlineTabs';
import { getUnconfiguredRegistryApps } from '@lib/app';
import type { AppMetadata, UserProfile } from '@lib/types/appCatalog';

import { isSameDraft, toDraft, type AppDraft } from './appDraft';
import AppSettingsTab from './AppSettingsTab';
import AppUsageTab from './AppUsageTab';

type AppSection = 'usage' | 'settings';

interface AppsTabProps {
  apps: AppMetadata[];
  users: UserProfile[];
  isUsersLoading: boolean;
  isUsersError: boolean;
  onSave: (appId: string, payload: Partial<AppMetadata>) => Promise<void>;
}

function AppsTab({ apps, users, isUsersLoading, isUsersError, onSave }: AppsTabProps) {
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [section, setSection] = useState<AppSection>('usage');
  const [drafts, setDrafts] = useState<Record<string, AppDraft>>({});

  const selectedApp = apps.find((app) => app.id === selectedAppId) ?? apps[0];
  const unconfiguredApps = getUnconfiguredRegistryApps(apps);

  const getDraft = (app: AppMetadata) => drafts[app.id] ?? toDraft(app);
  const isDirty = (app: AppMetadata) => !isSameDraft(getDraft(app), toDraft(app));

  const handleDraftChange = (appId: string, patch: Partial<AppDraft>) => {
    const app = apps.find((candidate) => candidate.id === appId);
    if (!app) return;

    setDrafts((current) => ({ ...current, [appId]: { ...(current[appId] ?? toDraft(app)), ...patch } }));
  };

  const handleSaved = (appId: string) =>
    setDrafts((current) =>
      Object.fromEntries(Object.entries(current).filter(([id]) => id !== appId)),
    );

  if (!selectedApp) {
    return <p className='text-muted-foreground text-sm'>No apps yet.</p>;
  }

  return (
    <div className='max-w-3xl space-y-4'>
      <div className='max-w-sm space-y-2'>
        <Select
          options={apps.map((app) => ({
            text: `${app.name || app.id}${isDirty(app) ? ' • unsaved' : ''}`,
            value: app.id,
            description: `/${app.path.replace(/^\//, '') || app.id}`,
          }))}
          value={selectedApp.id}
          onChange={setSelectedAppId}
        />
        {unconfiguredApps.length > 0 ? (
          <p className='text-warning text-xs'>
            Needs setup: {unconfiguredApps.map((app) => app.id).join(', ')}
          </p>
        ) : null}
      </div>

      <UnderlineTabs
        value={section}
        onChange={setSection}
        tabs={[
          { value: 'usage', label: 'Usage' },
          { value: 'settings', label: isDirty(selectedApp) ? 'Settings •' : 'Settings' },
        ]}
      />

      <TabPanel value='usage' activeValue={section}>
        <AppUsageTab
          key={selectedApp.id}
          app={selectedApp}
          users={users}
          isUsersLoading={isUsersLoading}
          isUsersError={isUsersError}
        />
      </TabPanel>
      <TabPanel value='settings' activeValue={section}>
        <AppSettingsTab
          key={selectedApp.id}
          app={selectedApp}
          draft={getDraft(selectedApp)}
          isDirty={isDirty(selectedApp)}
          users={users}
          onDraftChange={(patch) => handleDraftChange(selectedApp.id, patch)}
          onSave={onSave}
          onSaved={() => handleSaved(selectedApp.id)}
        />
      </TabPanel>
    </div>
  );
}

export default AppsTab;
