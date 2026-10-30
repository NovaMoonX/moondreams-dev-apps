import { useEffect, useRef, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import {
  clearFormDraft,
  readFormDraft,
  writeFormDraft,
} from '@lib/app/formDrafts';

interface UseFormDraftOptions<T> {
  /** Names this form and the record it edits (`app:form:id`); `null` keeps nothing. */
  key: string | null;
  /** The values the form opens with; a draft kept against different ones (the record changed elsewhere) is dropped. */
  base: unknown;
  /** Turns what was stored back into the form's value, or `null` when it no longer fits. */
  parse: (stored: unknown) => T | null;
}

/**
 * What a form held when the system closed the page in the background, read once when the form opens
 * so its state can start from it. Pair it with `useKeepFormDraft` under the same key.
 */
export function useFormDraft<T>({ key, base, parse }: UseFormDraftOptions<T>) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [restored] = useState(() =>
    uid && key ? parse(readFormDraft(uid, key, base)) : null,
  );
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
  /** The same opening values given to `useFormDraft`. */
  base: unknown;
  /** The form started from a kept draft, which makes that draft this form's to remove. */
  isRestored: boolean;
  value: T;
  isDirty: boolean;
  /** Keeps the draft when the form unmounts, for a form something else can close (a reveal, a lock); the form then calls the returned `forget` when the person closes it on purpose. */
  keepOnUnmount?: boolean;
}

/** Keeps a form's unsaved value on this device while it is dirty; closing the form (unmounting) forgets what it kept. */
export function useKeepFormDraft<T>({
  key,
  base,
  isRestored,
  value,
  isDirty,
  keepOnUnmount = false,
}: UseKeepFormDraftOptions<T>) {
  const baseText = JSON.stringify(base);
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  // A form only removes a draft it wrote, so one that opens clean never deletes another's kept work.
  const hasWrittenRef = useRef(isRestored);

  useEffect(() => {
    if (!uid || !key) return;
    if (isDirty) {
      if (writeFormDraft(uid, key, JSON.parse(baseText), value)) {
        hasWrittenRef.current = true;
      }
    } else if (hasWrittenRef.current) {
      clearFormDraft(uid, key);
    }
  }, [uid, key, baseText, value, isDirty]);

  useEffect(() => {
    if (!uid || !key || keepOnUnmount) return;
    return () => {
      if (hasWrittenRef.current) clearFormDraft(uid, key);
    };
  }, [uid, key, keepOnUnmount]);

  const forget = () => {
    if (uid && key && hasWrittenRef.current) clearFormDraft(uid, key);
  };
  return forget;
}
