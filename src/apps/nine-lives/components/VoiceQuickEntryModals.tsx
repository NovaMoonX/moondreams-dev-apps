import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';
import { LoaderCircle, Mic, Square } from 'lucide-react';

import MicrophoneAccess from '@/components/MicrophoneAccess';
import { useMicrophonePermission } from '@/hooks/useMicrophonePermission';

import type { UseVoiceQuickEntryResult } from '../hooks/useVoiceQuickEntry';
import IngestionDraftReviewModal from './IngestionDraftReviewModal';

interface VoiceQuickEntryModalsProps extends UseVoiceQuickEntryResult {
  householdId: string;
  uid: string;
}

const GRANTED_BUT_REFUSED =
  'This browser couldn’t start listening. Check that dictation is on in the device settings, then try again.';

function VoiceQuickEntryModals({
  householdId,
  uid,
  isModalOpen,
  isListening,
  isExtracting,
  transcript,
  error,
  isBlocked,
  activeDraft,
  handleTrigger,
  handleReRecord,
  handleClose,
  clearError,
}: VoiceQuickEntryModalsProps) {
  const permission = useMicrophonePermission();
  const needsMicrophone = isBlocked && permission !== 'granted';
  const shownError = isBlocked && permission === 'granted' ? GRANTED_BUT_REFUSED : error;

  if (activeDraft) {
    return (
      <IngestionDraftReviewModal
        isOpen
        householdId={householdId}
        uid={uid}
        draft={activeDraft}
        file={null}
        onClose={handleClose}
        onReRecord={handleReRecord}
      />
    );
  }

  return (
    <Modal
      isOpen={isModalOpen}
      onClose={handleClose}
      title='Voice quick entry'
      hideCloseButton={isListening || isExtracting}
    >
      <div className='space-y-4'>
        <p className='text-muted-foreground text-sm'>
          Speak a symptom, weight, expense, or other note. Your words will be turned into a draft for review.
        </p>
        <div className='bg-muted/40 min-h-24 rounded-md p-3 text-sm'>
          {transcript || (isListening ? 'Listening…' : 'Your transcript will appear here.')}
        </div>
        {needsMicrophone && <MicrophoneAccess onAllowed={clearError} />}
        {shownError && !needsMicrophone && <p className='text-sm text-red-500'>{shownError}</p>}
        <div className='flex justify-end gap-2'>
          <Button type='button' variant='secondary' onClick={handleClose} disabled={isExtracting}>
            Cancel
          </Button>
          {isListening ? (
            <Button type='button' onClick={handleTrigger}>
              <Square className='h-4 w-4' /> Stop and review
            </Button>
          ) : needsMicrophone ? null : (
            <Button type='button' onClick={handleTrigger} disabled={isExtracting}>
              {isExtracting ? <LoaderCircle className='h-4 w-4 animate-spin' /> : <Mic className='h-4 w-4' />}
              {isExtracting ? 'Reading note…' : 'Try again'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default VoiceQuickEntryModals;
