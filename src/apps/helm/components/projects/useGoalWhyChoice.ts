import { useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { HELM_COPY } from '@apps/helm/constants';
import { setWhyChoice } from '@apps/helm/store/actions/goalActions';

/** Picks the tidied why or the person's own: one write, with the failure shown. */
export function useGoalWhyChoice(projectId: string) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [isBusy, setIsBusy] = useState(false);

  const choose = async (choice: 'accepted' | 'declined') => {
    if (!user || isBusy) return;
    setIsBusy(true);
    try {
      await setWhyChoice(user.uid, projectId, choice);
    } catch (error) {
      console.error('Helm goal why was not changed', error);
      addToast({ title: HELM_COPY.goalWhyChoiceFailed, type: 'error' });
    }
    setIsBusy(false);
  };

  return { choose, isBusy };
}
