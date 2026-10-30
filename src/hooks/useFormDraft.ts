import { useEffect, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { clearFormDraft, readFormDraft, writeFormDraft } from '@lib/app/formDrafts';

interface UseFormDraftOptions<T> {
  /** Names this form and the record it edits (`app:form:id`); `null` keeps nothing. */
  key: string | null;
  /** Turns what was stored back into the form's value, or `null` when it no longer fits. */
  parse: (stored: unknown) => T | null;
}

/**
 * What a form held when the system closed the page in the background, read once when the form opens
 * so its state can start from it. Pair it with `useKeepFormDraft` under the same key.
 */
export function useFormDraft<T>({ key, parse }: UseFormDraftOptions<T>) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [restored] = useState(() => (uid && key ? parse(readFormDraft(uid, key)) : null));
  const [isNoticeShown, setIsNoticeShown] = useState(restored !== null);

  const result = {
    restored,
    isNoticeShown,
    hideNotice: () => setIsNoticeShown(false),
  };
  return result;
}

interface UseKeepFormDraftOptions<T> {
  key: string | null;
  value: T;
  isDirty: boolean;
}

/** Keeps a form's unsaved value on this device while it is dirty; closing the form (unmounting) forgets it. */
export function useKeepFormDraft<T>({ key, value, isDirty }: UseKeepFormDraftOptions<T>) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!uid || !key) return;
    if (isDirty) writeFormDraft(uid, key, value);
    else clearFormDraft(uid, key);
  }, [uid, key, value, isDirty]);

  useEffect(() => {
    if (!uid || !key) return;
    return () => clearFormDraft(uid, key);
  }, [uid, key]);
}
