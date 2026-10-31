import { useEffect, useState } from 'react';

import type { FeedbackGroup } from '@lib/feedback/types';
import { startFeedbackGroupsListener } from '@/store/listeners/feedbackListeners';

/** Every feedback group, most recently touched first, live. Admin only: pass `isEnabled` false for anyone else. */
export function useFeedbackGroups(isEnabled: boolean): {
  groups: FeedbackGroup[];
  status: 'loading' | 'ready' | 'error';
} {
  const [loaded, setLoaded] = useState<{
    groups: FeedbackGroup[] | null;
  } | null>(null);

  useEffect(() => {
    if (!isEnabled) return;
    return startFeedbackGroupsListener(
      (groups) => setLoaded({ groups }),
      (error) => {
        console.error('Failed to load feedback groups:', error);
        setLoaded({ groups: null });
      },
    );
  }, [isEnabled]);

  if (!isEnabled || loaded === null) return { groups: [], status: 'loading' };
  return loaded.groups === null
    ? { groups: [], status: 'error' }
    : { groups: loaded.groups, status: 'ready' };
}
