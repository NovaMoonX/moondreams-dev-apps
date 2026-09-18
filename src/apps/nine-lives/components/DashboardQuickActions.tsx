import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ArrowUp, FileUp } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';

import { selectIngestionDraftCountByHousehold } from '../store/selectors';
import CountBadge from './CountBadge';
import DocumentIngestionModal from './DocumentIngestionModal';
import VoiceQuickEntryButton from './VoiceQuickEntryButton';

interface DashboardQuickActionsProps {
  householdId: string;
}

function DashboardQuickActions({ householdId }: DashboardQuickActionsProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const pendingDraftCount = useAppSelector(selectIngestionDraftCountByHousehold(householdId));

  if (!user?.uid) {
    return null;
  }

  return (
    <div className='fixed right-4 bottom-4 z-40 flex flex-col items-end gap-2'>
      <VoiceQuickEntryButton householdId={householdId} uid={user.uid} />
      <Button
        type='button'
        variant='outline'
        size='icon'
        aria-label='Upload document'
        title='Upload document'
        className='h-10 w-10 shrink-0 gap-1 sm:h-12 sm:w-auto sm:px-4'
        onClick={() => setIsOpen(true)}
      >
        <FileUp className='h-4 w-4' />
        <span className='hidden sm:inline'>Upload</span>
        {pendingDraftCount > 0 && <CountBadge count={pendingDraftCount} />}
      </Button>
      <Button
        type='button'
        variant='primary'
        size='icon'
        aria-label='Scroll to top'
        title='Scroll to top'
        className='h-12 w-12 shrink-0 gap-1 sm:h-14 sm:w-auto sm:px-5'
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        <ArrowUp className='h-5 w-5' />
        <span className='hidden sm:inline'>Top</span>
      </Button>
      <DocumentIngestionModal
        isOpen={isOpen}
        householdId={householdId}
        uid={user.uid}
        onClose={() => setIsOpen(false)}
      />
    </div>
  );
}

export default DashboardQuickActions;
