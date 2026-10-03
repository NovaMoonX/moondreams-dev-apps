import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Settings } from 'lucide-react';

import SectionHeader from '@/components/SectionHeader';
import MembershipSettingsModal from '@apps/a-list/components/dashboard/MembershipSettingsModal';
import type { MembershipProfile } from '@apps/a-list/types';

interface DashboardScreenProps {
  membership: MembershipProfile;
}

function DashboardScreen({ membership }: DashboardScreenProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <section className='space-y-4'>
      <SectionHeader
        title='Dashboard'
        action={
          <Button
            type='button'
            variant='tertiary'
            size='icon'
            aria-label='Membership settings'
            onClick={() => setIsSettingsOpen(true)}
          >
            <Settings className='h-5 w-5' />
          </Button>
        }
      />
      <p className='text-muted-foreground text-sm'>
        Your savings will add up here as you log movies and what their tickets
        would have cost.
      </p>
      {isSettingsOpen && (
        <MembershipSettingsModal
          membership={membership}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </section>
  );
}

export default DashboardScreen;
