import { useState } from 'react';

import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';
import { LoaderCircle, Mic, Square } from 'lucide-react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useAppDispatch, useAppSelector } from '@/store';

import { createDraftFromExtraction } from '../store/actions/ingestionDraftsActions';
import { useVoiceTranscription } from '../hooks/useVoiceTranscription';
import IngestionDraftReviewModal from './IngestionDraftReviewModal';

interface VoiceQuickEntryButtonProps {
  householdId: string;
  uid: string;
  className?: string;
}

function VoiceQuickEntryButton({ householdId, uid, className }: VoiceQuickEntryButtonProps) {
  const dispatch = useAppDispatch();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const {
    cancel,
    error: transcriptionError,
    isListening,
    isSupported,
    reset,
    start,
    stop,
    transcript,
  } = useVoiceTranscription();
  const activeDraft = useAppSelector((state) =>
    activeDraftId
      ? (state.nineLives.ingestionDrafts.items.find((draft) => draft.id === activeDraftId) ?? null)
      : null,
  );

  const error = submissionError ?? transcriptionError;

  const handleClose = () => {
    cancel();
    reset();
    setIsModalOpen(false);
    setActiveDraftId(null);
    setIsExtracting(false);
    setSubmissionError(null);
  };

  const handleStop = async () => {
    setIsExtracting(true);
    setSubmissionError(null);

    try {
      const spokenText = await stop();

      if (!spokenText) {
        throw new Error('No speech was detected. Try again when you are ready.');
      }

      const draft = await dispatch(
        createDraftFromExtraction({ householdId, uid, text: spokenText }),
      ).unwrap();
      setActiveDraftId(draft.id);
    } catch (nextError) {
      setSubmissionError(nextError instanceof Error ? nextError.message : 'Unable to read your note.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleTrigger = () => {
    if (isListening) {
      void handleStop();
      return;
    }

    reset();
    setSubmissionError(null);
    setIsModalOpen(true);
    start();
  };

  if (activeDraft) {
    return (
      <IngestionDraftReviewModal
        isOpen
        householdId={householdId}
        uid={uid}
        draft={activeDraft}
        file={null}
        onClose={handleClose}
      />
    );
  }

  return (
    <>
      <Button
        type='button'
        variant='outline'
        size='icon'
        aria-label={isListening ? 'Stop voice entry' : 'Start voice entry'}
        title={
          isSupported
            ? isListening
              ? 'Stop voice entry'
              : 'Voice entry'
            : 'Voice entry is not supported in this browser'
        }
        disabled={!isSupported || isExtracting}
        className={join('h-10 w-10 shrink-0 gap-1 sm:h-12 sm:w-auto sm:px-4', className)}
        onClick={handleTrigger}
      >
        {isListening ? <Square className='h-4 w-4' /> : <Mic className='h-4 w-4' />}
        <span className='hidden sm:inline'>{isListening ? 'Stop' : 'Voice'}</span>
      </Button>
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
          {error && <p className='text-sm text-red-500'>{error}</p>}
          <div className='flex justify-end gap-2'>
            <Button type='button' variant='secondary' onClick={handleClose} disabled={isExtracting}>
              Cancel
            </Button>
            {isListening ? (
              <Button type='button' onClick={() => void handleStop()}>
                <Square className='h-4 w-4' /> Stop and review
              </Button>
            ) : (
              <Button type='button' onClick={handleTrigger} disabled={isExtracting}>
                {isExtracting ? <LoaderCircle className='h-4 w-4 animate-spin' /> : <Mic className='h-4 w-4' />}
                {isExtracting ? 'Reading note…' : 'Try again'}
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

export default VoiceQuickEntryButton;
