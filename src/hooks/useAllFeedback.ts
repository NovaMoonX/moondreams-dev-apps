import { useEffect, useState } from 'react';

import type { Feedback } from '@lib/feedback/types';
import {
  ALL_FEEDBACK_LIMIT,
  startAllFeedbackListener,
} from '@/store/listeners/feedbackListeners';

/** Every feedback, newest activity first, live because the admin edits them. Admin only: pass `isEnabled` false for anyone else. */
export function useAllFeedback(isEnabled: boolean): {
  items: Feedback[];
  status: 'loading' | 'ready' | 'error';
  /** The newest are shown; older feedback is left out. */
  isTruncated: boolean;
} {
  const [loaded, setLoaded] = useState<{ items: Feedback[] | null } | null>(
    null,
  );

  useEffect(() => {
    if (!isEnabled) return;
    return startAllFeedbackListener(
      (items) => setLoaded({ items }),
      (error) => {
        console.error('Failed to load feedback:', error);
        setLoaded({ items: null });
      },
    );
  }, [isEnabled]);

  if (!isEnabled || loaded === null)
    return { items: [], status: 'loading', isTruncated: false };
  return loaded.items === null
    ? { items: [], status: 'error', isTruncated: false }
    : {
        items: loaded.items,
        status: 'ready',
        isTruncated: loaded.items.length >= ALL_FEEDBACK_LIMIT,
      };
}
