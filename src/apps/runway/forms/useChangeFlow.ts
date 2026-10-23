import { useRef, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { CHANGE_WORDS } from '@apps/runway/constants';
import { getErrorMessage } from '@/utils/errorUtils';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { changeItem } from '@apps/runway/store/actions/itemActions';
import {
  describeChange,
  isSamePayload,
  type ItemPayload,
} from '@apps/runway/utils/changeText';
import {
  getEffectiveFrom,
  INITIAL_FROM_WHEN,
} from '@apps/runway/utils/fromWhen';
import { formatDateUTC } from '@/utils/formatUtils';
import type { ItemKind } from '@apps/runway/types';

interface UseChangeFlowArgs {
  itemId: string;
  kind: ItemKind;
  current: ItemPayload;
  /** What the form builds now; null while it is not finished. */
  candidate: ItemPayload | null;
  onDone: () => void;
}

/** The state an edit shares across every kind of item: when it starts, the reason step, and one guarded save. */
export function useChangeFlow({
  itemId,
  kind,
  current,
  candidate,
  onDone,
}: UseChangeFlowArgs) {
  const { user } = useAuth();
  const today = todayAsUtcDate();
  const [from, setFrom] = useState(INITIAL_FROM_WHEN);
  const [step, setStep] = useState<'form' | 'reason'>('form');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);

  const effectiveFrom = getEffectiveFrom(from, today);
  const isUnchanged = candidate !== null && isSamePayload(current, candidate);
  const summaryText =
    candidate === null ? '' : describeChange(current, candidate);

  const save = async (reason: string | null) => {
    if (
      isSavingRef.current ||
      !user ||
      candidate === null ||
      effectiveFrom === null
    )
      return;
    isSavingRef.current = true;
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await changeItem(user.uid, encryption, {
        itemId,
        kind,
        payload: candidate,
        summary: `${candidate.name}: ${summaryText}, from ${formatDateUTC(effectiveFrom)}.`,
        note: reason,
        effectiveFrom,
      });
      onDone();
    } catch (saveError) {
      setError(
        getErrorMessage(
          saveError,
          'This change did not save. Nothing was changed.',
        ),
      );
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  const getBlocker = (formBlocker: string | null) => {
    if (formBlocker !== null) return formBlocker;
    if (effectiveFrom === null) return CHANGE_WORDS.dateBlocker;
    if (isUnchanged) return CHANGE_WORDS.unchanged;
    return null;
  };

  return {
    getBlocker,
    from,
    setFrom,
    step,
    setStep,
    note,
    setNote,
    error,
    isSaving,
    effectiveFrom,
    isUnchanged,
    summaryText,
    today,
    save,
  };
}

export type ChangeFlow = ReturnType<typeof useChangeFlow>;
