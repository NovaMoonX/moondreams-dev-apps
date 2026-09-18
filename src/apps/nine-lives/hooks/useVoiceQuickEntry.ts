import { useState } from 'react';

import { useAppDispatch, useAppSelector } from '@/store';

import { createDraftFromExtraction, discardIngestionDraft } from '../store/actions/ingestionDraftsActions';
import type { IngestionDraft } from '../types';
import { useVoiceTranscription } from './useVoiceTranscription';

export interface UseVoiceQuickEntryResult {
  isListening: boolean;
  isExtracting: boolean;
  isSupported: boolean;
  isModalOpen: boolean;
  transcript: string;
  error: string | null;
  activeDraft: IngestionDraft | null;
  /** Starts listening, or — while already listening — stops and extracts a draft from what was said. */
  handleTrigger: () => void;
  /** Discards any in-progress draft and starts listening again without leaving the review flow. */
  handleReRecord: () => void;
  handleClose: () => void;
}

/**
 * Owns the microphone-recording → extraction → review lifecycle for voice quick entry.
 * Lifted out of the trigger button so the dashboard can render two trigger locations
 * (a flat one and a floating one) against a single recording session instead of two
 * independent `useVoiceTranscription` instances racing each other.
 */
export function useVoiceQuickEntry(householdId: string, uid: string): UseVoiceQuickEntryResult {
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

  const discardActiveDraft = (draftId: string | null) => {
    if (draftId) {
      void dispatch(discardIngestionDraft({ householdId, draftId }));
    }
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

  const handleReRecord = () => {
    discardActiveDraft(activeDraftId);
    setActiveDraftId(null);
    setSubmissionError(null);
    reset();
    start();
  };

  const handleClose = () => {
    discardActiveDraft(activeDraftId);
    cancel();
    reset();
    setIsModalOpen(false);
    setActiveDraftId(null);
    setIsExtracting(false);
    setSubmissionError(null);
  };

  return {
    isListening,
    isExtracting,
    isSupported,
    isModalOpen,
    transcript,
    error,
    activeDraft,
    handleTrigger,
    handleReRecord,
    handleClose,
  };
}
