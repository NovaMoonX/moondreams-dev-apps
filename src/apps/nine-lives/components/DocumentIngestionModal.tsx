import { useState } from 'react';

import { Button, Input, Modal } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { Trash2 } from 'lucide-react';
import { shallowEqual } from 'react-redux';

import { useAppDispatch, useAppSelector } from '@/store';
import { formatDateTime } from '@/utils/formatUtils';

import {
  createDraftFromExtraction,
  discardIngestionDraft,
} from '../store/actions/ingestionDraftsActions';
import { selectIngestionDraftsByHousehold } from '../store/selectors';
import IngestionDraftReviewModal from './IngestionDraftReviewModal';

/** Keeps the "reading" state visible for at least this long so it doesn't flash by unreadably on a fast response. */
const MIN_EXTRACTION_LOADING_MS = 2000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface DocumentIngestionModalProps {
  isOpen: boolean;
  householdId: string;
  uid: string;
  intent?: 'expense' | 'record';
  onClose: () => void;
}

function DocumentIngestionModal({
  isOpen,
  householdId,
  uid,
  intent,
  onClose,
}: DocumentIngestionModalProps) {
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const [file, setFile] = useState<File | null>(null);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pendingDrafts = useAppSelector(selectIngestionDraftsByHousehold(householdId), shallowEqual);
  const activeDraft = useAppSelector((state) =>
    activeDraftId
      ? (state.nineLives.ingestionDrafts.items.find((item) => item.id === activeDraftId) ?? null)
      : null,
  );

  const handleClose = () => {
    setFile(null);
    setActiveDraftId(null);
    setError(null);
    onClose();
  };

  const handleResume = (draftId: string) => {
    setFile(null);
    setActiveDraftId(draftId);
  };

  const handleDiscardFromList = async (draftId: string, sourceFileName: string) => {
    const confirmed = await confirm({
      title: 'Discard document',
      message: `Are you sure you want to discard "${sourceFileName}"? Nothing will be saved.`,
      destructive: true,
    });

    if (!confirmed) {
      return;
    }

    await dispatch(discardIngestionDraft({ householdId, draftId })).unwrap();
  };

  const handleSubmit = async () => {
    if (!file) {
      setError('Choose a PDF or image first.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const [created] = await Promise.all([
        dispatch(createDraftFromExtraction({ householdId, uid, file })).unwrap(),
        delay(MIN_EXTRACTION_LOADING_MS),
      ]);
      setActiveDraftId(created.id);
    } catch (submissionError) {
      setError(
        typeof submissionError === 'string'
          ? submissionError
          : 'Unable to read this document.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (activeDraft) {
    return (
      <IngestionDraftReviewModal
        isOpen
        householdId={householdId}
        uid={uid}
        draft={activeDraft}
        file={file}
        intent={intent}
        onClose={handleClose}
      />
    );
  }

  if (isSubmitting) {
    return (
      <Modal isOpen={isOpen} onClose={() => undefined} title='Upload document' hideCloseButton>
        <div className='flex flex-col items-center justify-center gap-4 py-10 text-center'>
          <div className='h-16 w-16 animate-spin rounded-full border-4 border-foreground/20 border-t-accent' />
          <p className='text-lg text-foreground/80'>Uploading and parsing your document…</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title='Upload document'>
      <div className='space-y-4'>
        <p className='text-muted-foreground text-sm'>
          Upload a vet PDF or photo and review the structured records it finds before saving.
        </p>
        <Input
          type='file'
          accept='application/pdf,image/*'
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setError(null);
            event.target.value = '';
          }}
        />
        {file && <p className='text-muted-foreground text-sm'>{file.name}</p>}
        {error && <p className='text-sm text-red-500'>{error}</p>}
        <div className='flex justify-end gap-2'>
          <Button type='button' variant='secondary' onClick={handleClose}>
            Cancel
          </Button>
          <Button type='button' disabled={!file} onClick={() => void handleSubmit()}>
            Review document
          </Button>
        </div>

        {pendingDrafts.length > 0 && (
          <div className='space-y-2 border-t border-border pt-4'>
            <p className='text-sm font-medium'>Unfinished uploads</p>
            {pendingDrafts.map((draft) => (
              <div
                key={draft.id}
                className='flex items-center justify-between gap-2 rounded-md border border-border p-2'
              >
                <div>
                  <p className='text-sm'>{draft.sourceFileName}</p>
                  <p className='text-muted-foreground text-xs'>{formatDateTime(draft.createdAt)}</p>
                </div>
                <div className='flex items-center gap-1'>
                  <Button type='button' variant='secondary' size='sm' onClick={() => handleResume(draft.id)}>
                    Continue
                  </Button>
                  <Button
                    type='button'
                    variant='secondary'
                    size='icon'
                    aria-label='Discard'
                    className='bg-transparent text-destructive hover:bg-destructive/10'
                    onClick={() => void handleDiscardFromList(draft.id, draft.sourceFileName)}
                  >
                    <Trash2 className='h-4 w-4' />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

export default DocumentIngestionModal;
