import { useState } from 'react';

import { Button, Input, Modal } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import { useAppDispatch, useAppSelector } from '@/store';

import {
  createDraftFromExtraction,
  discardIngestionDraft,
} from '../store/actions/ingestionDraftsActions';
import IngestionDraftReviewModal from './IngestionDraftReviewModal';

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
  const [createdDraftId, setCreatedDraftId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const existingDraft = useAppSelector((state) => {
    const drafts = state.nineLives.ingestionDrafts.items.filter(
      (item) => item.householdId === householdId,
    );
    return drafts.length > 0
      ? drafts.reduce((latest, item) => (item.createdAt > latest.createdAt ? item : latest))
      : null;
  });
  const createdDraft = useAppSelector((state) =>
    createdDraftId
      ? (state.nineLives.ingestionDrafts.items.find((item) => item.id === createdDraftId) ?? null)
      : null,
  );
  const draft = createdDraft;

  const handleClose = () => {
    setFile(null);
    setCreatedDraftId(null);
    setError(null);
    onClose();
  };

  const handleResumeExisting = () => {
    if (existingDraft) {
      setCreatedDraftId(existingDraft.id);
    }
  };

  const handleStartNew = async () => {
    if (!existingDraft) {
      return;
    }

    const confirmed = await confirm({
      title: 'Start a new upload',
      message: `This discards the unfinished upload of "${existingDraft.sourceFileName}". Nothing from it will be saved.`,
      destructive: true,
    });

    if (!confirmed) {
      return;
    }

    await dispatch(discardIngestionDraft({ householdId, draftId: existingDraft.id })).unwrap();
  };

  const handleSubmit = async () => {
    if (!file) {
      setError('Choose a PDF or image first.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const created = await dispatch(
        createDraftFromExtraction({ householdId, uid, file }),
      ).unwrap();
      setCreatedDraftId(created.id);
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

  if (draft) {
    return (
      <IngestionDraftReviewModal
        isOpen
        householdId={householdId}
        uid={uid}
        draft={draft}
        file={file}
        intent={intent}
        onClose={handleClose}
      />
    );
  }

  if (existingDraft) {
    return (
      <Modal isOpen={isOpen} onClose={handleClose} title='Continue unfinished upload?'>
        <div className='space-y-4'>
          <p className='text-muted-foreground text-sm'>
            You have an unfinished review for <strong>{existingDraft.sourceFileName}</strong>. Continue
            reviewing it, or start a new upload instead.
          </p>
          {error && <p className='text-sm text-red-500'>{error}</p>}
          <div className='flex flex-wrap justify-end gap-2'>
            <Button type='button' variant='secondary' onClick={() => void handleStartNew()}>
              Start new upload
            </Button>
            <Button type='button' onClick={handleResumeExisting}>
              Continue
            </Button>
          </div>
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
          disabled={isSubmitting}
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
          <Button type='button' loading={isSubmitting} disabled={!file} onClick={() => void handleSubmit()}>
            {isSubmitting ? 'Reading…' : 'Review document'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default DocumentIngestionModal;
