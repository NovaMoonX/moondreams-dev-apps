import { useState } from 'react';

import { Button, Input, Modal } from '@moondreamsdev/dreamer-ui/components';

import { useAppDispatch, useAppSelector } from '@/store';

import {
  createDraftFromExtraction,
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
  const [file, setFile] = useState<File | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const draft = useAppSelector((state) =>
    draftId ? state.nineLives.ingestionDrafts.items.find((item) => item.id === draftId) ?? null : null,
  );

  const handleClose = () => {
    setFile(null);
    setDraftId(null);
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (!file) {
      setError('Choose a PDF or image first.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const createdDraft = await dispatch(
        createDraftFromExtraction({ householdId, uid, file }),
      ).unwrap();
      setDraftId(createdDraft.id);
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
