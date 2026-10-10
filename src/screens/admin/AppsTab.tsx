import { Select, Tabs, TabsList, TabsTrigger } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { useState } from 'react';

import { getUnconfiguredRegistryApps } from '@lib/app';
import type { AppMetadata, UserProfile } from '@lib/types/appCatalog';

import AppSettingsTab from './AppSettingsTab';
import { ADMIN_TAB_TRIGGERS_CLASS } from './constants';
import AppUsageTab from './AppUsageTab';

type AppSection = 'usage' | 'settings';

interface AppsTabProps {
  apps: AppMetadata[];
  users: UserProfile[];
  onSave: (appId: string, payload: Partial<AppMetadata>) => Promise<void>;
}

function AppsTab({ apps, users, onSave }: AppsTabProps) {
  const { confirm } = useActionModal();
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [section, setSection] = useState<AppSection>('usage');
  const [isDirty, setIsDirty] = useState(false);

  const selectedApp = apps.find((app) => app.id === selectedAppId) ?? apps[0];
  const unconfiguredApps = getUnconfiguredRegistryApps(apps);

  const handleSelectApp = async (nextAppId: string) => {
    if (!selectedApp || nextAppId === selectedApp.id) return;

    if (isDirty) {
      const confirmed = await confirm({
        title: 'Discard changes',
        message: `You have unsaved changes to ${selectedApp.name}. Switch apps and lose them?`,
        confirmText: 'Discard',
        destructive: true,
      });
      if (!confirmed) return;
    }

    setSelectedAppId(nextAppId);
  };

  if (!selectedApp) {
    return <p className='text-muted-foreground text-sm'>No apps yet.</p>;
  }

  return (
    <div className='max-w-3xl space-y-4'>
      <div className='max-w-sm space-y-2'>
        <Select
          options={apps.map((app) => ({
            text: app.name || app.id,
            value: app.id,
            description: `/${app.path.replace(/^\//, '') || app.id}`,
          }))}
          value={selectedApp.id}
          onChange={handleSelectApp}
        />
        {unconfiguredApps.length > 0 ? (
          <p className='text-warning text-xs'>
            Needs setup: {unconfiguredApps.map((app) => app.id).join(', ')}
          </p>
        ) : null}
      </div>

      <Tabs
        value={section}
        onValueChange={(value) => setSection(value as AppSection)}
        variant='underline'
        tabsWidth='full'
        triggersClassName={ADMIN_TAB_TRIGGERS_CLASS}
      >
        <TabsList>
          <TabsTrigger value='usage'>Usage</TabsTrigger>
          <TabsTrigger value='settings'>{isDirty ? 'Settings •' : 'Settings'}</TabsTrigger>
        </TabsList>
      </Tabs>

      <div hidden={section !== 'usage'}>
        <AppUsageTab key={selectedApp.id} app={selectedApp} users={users} />
      </div>
      <div hidden={section !== 'settings'}>
        <AppSettingsTab
          key={selectedApp.id}
          app={selectedApp}
          users={users}
          onDirtyChange={setIsDirty}
          onSave={onSave}
        />
      </div>
    </div>
  );
}

export default AppsTab;
