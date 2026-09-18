import { useEffect, useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ArrowUp, FileUp } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';

import { useVoiceQuickEntry } from '../hooks/useVoiceQuickEntry';
import { selectIngestionDraftCountByHousehold } from '../store/selectors';
import CountBadge from './CountBadge';
import DocumentIngestionModal from './DocumentIngestionModal';
import VoiceQuickEntryModals from './VoiceQuickEntryModals';
import VoiceQuickEntryTrigger from './VoiceQuickEntryTrigger';

interface DashboardQuickActionsProps {
  householdId: string;
}

const FLOATING_SECONDARY_ACTIONS_CLASSNAME = 'h-10 w-10 shrink-0 gap-1 sm:h-12 sm:w-auto sm:px-4 rounded-full! bg-background'

function DashboardQuickActions({ householdId }: DashboardQuickActionsProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isFlatRowVisible, setIsFlatRowVisible] = useState(true);
  const flatRowRef = useRef<HTMLDivElement>(null);
  const pendingDraftCount = useAppSelector(selectIngestionDraftCountByHousehold(householdId));
  const voiceQuickEntry = useVoiceQuickEntry(householdId, user?.uid ?? '');

  useEffect(() => {
    const node = flatRowRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(([entry]) => setIsFlatRowVisible(entry.isIntersecting));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  if (!user?.uid) {
    return null;
  }

  return (
    <>
      <div ref={flatRowRef} className='flex flex-wrap items-center justify-center gap-2'>
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='gap-1'
          onClick={() => setIsOpen(true)}
        >
          <FileUp className='h-4 w-4' /> Upload document
          {pendingDraftCount > 0 && <CountBadge count={pendingDraftCount} />}
        </Button>
        <VoiceQuickEntryTrigger
          variant='flat'
          isListening={voiceQuickEntry.isListening}
          isExtracting={voiceQuickEntry.isExtracting}
          isSupported={voiceQuickEntry.isSupported}
          onClick={voiceQuickEntry.handleTrigger}
        />
      </div>

      {!isFlatRowVisible && (
        <div className='fixed right-4 bottom-4 z-40 flex flex-col items-end gap-2'>
          <VoiceQuickEntryTrigger
            variant='floating'
            isListening={voiceQuickEntry.isListening}
            isExtracting={voiceQuickEntry.isExtracting}
            isSupported={voiceQuickEntry.isSupported}
            onClick={voiceQuickEntry.handleTrigger}
            buttonClassName={FLOATING_SECONDARY_ACTIONS_CLASSNAME}
          />
          <Button
            type='button'
            variant='outline'
            size='icon'
            aria-label='Upload document'
            title='Upload document'
            className={FLOATING_SECONDARY_ACTIONS_CLASSNAME}
            onClick={() => setIsOpen(true)}
          >
            <FileUp className='h-4 w-4' />
            <span className='hidden sm:inline'>Upload</span>
          </Button>
          <Button
            type='button'
            variant='primary'
            size='icon'
            aria-label='Scroll to top'
            title='Scroll to top'
            className='h-12 w-12 shrink-0 gap-1 sm:h-12 sm:w-auto sm:px-3 rounded-full!'
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <ArrowUp className='h-5 w-5' />
            <span className='hidden sm:inline'>Top</span>
          </Button>
        </div>
      )}

      <VoiceQuickEntryModals householdId={householdId} uid={user.uid} {...voiceQuickEntry} />
      <DocumentIngestionModal
        isOpen={isOpen}
        householdId={householdId}
        uid={user.uid}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}

export default DashboardQuickActions;
