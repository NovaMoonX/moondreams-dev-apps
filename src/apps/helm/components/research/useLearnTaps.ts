import { useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { HELM_COPY } from '@apps/helm/constants';
import {
  doneLearn,
  keepLearn,
  removeLearn,
  type LearnTap,
} from '@apps/helm/store/actions/learnLaterActions';
import { takeBack } from '@apps/helm/store/actions/undoActions';
import type { OpenResearch } from '@apps/helm/types';
import { UNDO_WINDOW_MS } from '@/lib/undo';

/** Remove, Done with it and Save to my knowledge on a saved question: each says what it did in a toast with an Undo that takes the whole tap back, and the surface is locked only while its own write is in flight. */
export function useLearnTaps(onFinished?: () => void) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [isBusy, setIsBusy] = useState(false);

  const say = (title: string, tap: LearnTap) => {
    if (!user) return;
    const uid = user.uid;
    addToast({
      duration: UNDO_WINDOW_MS,
      title,
      type: 'success',
      action: {
        label: HELM_COPY.undo,
        onClick: () =>
          void tap.written
            .then(() => takeBack(uid, tap.executionId))
            .then((result) => {
              if (result.kind === 'offline') {
                addToast({
                  title: HELM_COPY.undoNeedsConnectionTitle,
                  description: HELM_COPY.undoNeedsConnectionBody,
                  type: 'error',
                });
              } else if (result.kind === 'refused') {
                addToast({ title: HELM_COPY.undoFailed, type: 'error' });
              }
            })
            .catch((error: unknown) => {
              console.error('Helm learn later tap was not taken back', error);
              addToast({ title: HELM_COPY.undoFailed, type: 'error' });
            }),
      },
    });
  };

  const run = async (
    start: (uid: string) => Promise<(LearnTap & { title?: string }) | null>,
    title: string,
  ) => {
    if (!user || isBusy) return;
    setIsBusy(true);
    try {
      const tap = await start(user.uid);
      if (tap) {
        say(tap.title ?? title, tap);
        tap.written.catch((error: unknown) => {
          console.error('Helm learn later change was not saved', error);
          addToast({ title: HELM_COPY.learnActionFailed, type: 'error' });
        });
        onFinished?.();
      }
    } catch (error) {
      console.error('Helm learn later change was not saved', error);
      addToast({ title: HELM_COPY.learnActionFailed, type: 'error' });
    }
    setIsBusy(false);
  };

  return {
    isBusy,
    remove: (item: OpenResearch) =>
      run(
        (uid) => removeLearn(uid, item),
        HELM_COPY.learnRemoved(item.subject),
      ),
    done: (item: OpenResearch) =>
      run((uid) => doneLearn(uid, item), HELM_COPY.learnDoneLine(item.subject)),
    keep: (item: OpenResearch) =>
      run(async (uid) => {
        const result = await keepLearn(uid, item);
        if (result.kind === 'saved')
          return {
            ...result,
            title: result.topicName
              ? HELM_COPY.learnKeptIn(result.topicName)
              : HELM_COPY.learnKept,
          };
        addToast({
          title:
            result.kind === 'full' ? HELM_COPY.notesFull : HELM_COPY.saveFailed,
          type: 'info',
        });
        return null;
      }, HELM_COPY.learnKept),
  };
}
