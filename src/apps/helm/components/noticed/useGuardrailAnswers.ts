import { useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { readNotNowWeeks } from '@apps/helm/components/noticed/patternWords';
import {
  toShortDay,
  toToastDay,
} from '@apps/helm/components/noticed/guardrailWords';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useHabitClock } from '@apps/helm/hooks/useHabitClock';
import {
  acceptGuardrail,
  undoGuardrailAnswer,
} from '@apps/helm/store/actions/guardrailActions';
import {
  notNowPattern,
  reopenPattern,
  stopPattern,
} from '@apps/helm/store/actions/patternActions';
import type { OpenPattern } from '@apps/helm/types';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface Target {
  collection: 'projects' | 'habits';
  id: string;
}

export function useGuardrailAnswers() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { dayKey } = useHabitClock();
  const assistant = useAssistantName();
  const [busyId, setBusyId] = useState<string | null>(null);

  const guard = async (id: string, work: (uid: string) => Promise<boolean>) => {
    if (!user || busyId !== null) return false;
    setBusyId(id);
    try {
      return await work(user.uid);
    } catch (error) {
      console.error('Helm guardrail answer was not saved', error);
      addToast({ title: HELM_COPY.noticedOfferFailed, type: 'error' });
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const told = (
    result: 'saved' | 'offline' | 'missing' | 'kept' | 'unreadable',
    done: string,
  ) => {
    addToast({
      title:
        result === 'saved'
          ? done
          : result === 'offline'
            ? HELM_COPY.editNeedsConnection
            : HELM_COPY.noticedOfferMissing,
      type: result === 'saved' ? 'success' : 'info',
    });
    return result === 'saved';
  };

  return {
    busyId,
    pause: (
      pattern: OpenPattern,
      options: {
        target?: Target;
        until?: number | null;
        isHold?: boolean;
      } = {},
    ) =>
      guard(pattern.id, async (uid) => {
        const answer = await acceptGuardrail(uid, pattern, options);
        if (answer.kind !== 'saved') return told(answer.kind, '');
        const date = toToastDay(answer.until);
        addToast({
          title: options.isHold
            ? HELM_COPY.guardrailHeld(answer.name, date)
            : options.target
              ? HELM_COPY.guardrailSetAside(answer.name, date)
              : HELM_COPY.guardrailPaused(answer.name, date, assistant),
          type: 'success',
          action: {
            label: HELM_COPY.undo,
            onClick: () =>
              void guard(pattern.id, async () => {
                const result = await answer.undo();
                if (result !== 'saved') told(result, '');
                return result === 'saved';
              }),
          },
        });
        return true;
      }),
    undo: (pattern: OpenPattern, name: string) =>
      guard(pattern.id, async (uid) =>
        told(
          await undoGuardrailAnswer(uid, pattern),
          HELM_COPY.guardrailUndone(name),
        ),
      ),
    keepGoing: (pattern: OpenPattern) => {
      const weeks = readNotNowWeeks(pattern);
      return guard(pattern.id, async (uid) =>
        told(
          await notNowPattern(uid, pattern.id, dayKey),
          HELM_COPY.guardrailNo(
            weeks === null
              ? null
              : toShortDay(Date.parse(dayKey) + weeks * WEEK_MS),
          ),
        ),
      );
    },
    stop: (pattern: OpenPattern, name: string) =>
      guard(pattern.id, async (uid) => {
        const result = await stopPattern(uid, pattern.id);
        if (result !== 'saved') return told(result, '');
        addToast({
          title: HELM_COPY.guardrailStopped(assistant, name),
          type: 'success',
          action: {
            label: HELM_COPY.undo,
            onClick: () =>
              void guard(pattern.id, async () => {
                const undone = await reopenPattern(uid, pattern.id);
                if (undone !== 'saved') told(undone, '');
                return undone === 'saved';
              }),
          },
        });
        return true;
      }),
  };
}
