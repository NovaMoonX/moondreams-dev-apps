import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';

import { TabPanel, UnderlineTabs } from '@/components/UnderlineTabs';
import NavButton from '@/ui/NavButton';
import { useAppCatalog } from '@hooks/useAppCatalog';
import { useAuth } from '@hooks/useAuth';
import { ADMIN_QUERY_KEY, adminUsersQueryOptions } from '@lib/admin/adminQueries';
import { ADMIN_EMAIL } from '@lib/app';
import type { UserProfile } from '@lib/types/appCatalog';

import AppsTab from './admin/AppsTab';
import MembersTab from './admin/MembersTab';

type AdminSection = 'apps' | 'members';

const NO_USERS: UserProfile[] = [];

function AdminDashboard() {
  const { user, isAdmin } = useAuth();
  const { allApps, updateAppMetadata } = useAppCatalog();
  const queryClient = useQueryClient();
  const [section, setSection] = useState<AdminSection>('apps');
  const usersQuery = useQuery({ ...adminUsersQueryOptions(), enabled: isAdmin });
  const isRefreshing = useIsFetching({ queryKey: ADMIN_QUERY_KEY }) > 0;
  const users = usersQuery.data ?? NO_USERS;

  if (!user || !isAdmin) {
    return null;
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
            <Button
              variant='outline'
              size='icon'
              className='size-10'
              aria-label='Refresh members and usage'
              disabled={isRefreshing}
              onClick={() => queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEY })}
            >
              <RefreshCw className={join('size-4', isRefreshing && 'animate-spin')} />
            </Button>
            <NavButton href='/' variant='outline'>
              Back
            </NavButton>
          </div>
        </header>

        <UnderlineTabs
          value={section}
          onChange={setSection}
          tabs={[
            { value: 'apps', label: 'Apps' },
            { value: 'members', label: 'Members' },
          ]}
        />

        <TabPanel value='apps' activeValue={section}>
          <AppsTab
            apps={allApps}
            users={users}
            isUsersLoading={usersQuery.isPending}
            isUsersError={usersQuery.isError}
            onSave={updateAppMetadata}
          />
        </TabPanel>
        <TabPanel value='members' activeValue={section}>
          {section === 'members' ? (
            <MembersTab
              apps={allApps}
              users={users}
              isUsersLoading={usersQuery.isPending}
              isUsersError={usersQuery.isError}
            />
          ) : null}
        </TabPanel>
      </div>
    </div>
  );
}

export default AdminDashboard;
