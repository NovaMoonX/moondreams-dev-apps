import { useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { formatClockTime, formatDateShortUTC } from '@/utils/formatUtils';
import { readNotNowWeeks } from '@apps/helm/components/noticed/patternWords';
import { HELM_COPY, PATTERN_BACKOFF_WEEKS } from '@apps/helm/constants';
import { useHabitClock } from '@apps/helm/hooks/useHabitClock';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import {
  acceptPattern,
  confirmPattern,
  forgetWords,
  notNowPattern,
  reopenPattern,
  retirePattern,
  stopPattern,
  undoPattern,
  type PatternChangeResult,
} from '@apps/helm/store/actions/patternActions';
import type { OpenPattern } from '@apps/helm/types';

type Outcome = PatternChangeResult | 'unreadable';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** What a yes did, in words: the new time, how often, or that the person's own change saved. */
const readDone = (pattern: OpenPattern) => {
  const { effect } = pattern;
  const done = HELM_COPY.noticedOfferDone;
  return effect.kind === 'moveWindow'
    ? done.moveWindow(formatClockTime(effect.start))
    : effect.kind === 'lowerCadence'
      ? done.lowerCadence
      : effect.kind === 'raiseCadence'
        ? done.raiseCadence
        : effect.kind === 'keepTime'
          ? done.keepTime
          : done.change;
};

/** The answers a person can give a pattern, each told in a toast; one write at a time, and nothing else on the screen locks. */
export function usePatternAnswers() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { dayKey } = useHabitClock();
  const [busyId, setBusyId] = useState<string | null>(null);

  const run = async (
    id: string,
    work: (uid: string) => Promise<Outcome>,
    done: string,
  ) => {
    if (!user || busyId !== null) return false;
    setBusyId(id);
    try {
      const result = await work(user.uid);
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
    } catch (error) {
      console.error('Helm pattern answer was not saved', error);
      addToast({ title: HELM_COPY.noticedOfferFailed, type: 'error' });
      return false;
    } finally {
      setBusyId(null);
    }
  };

  return {
    busyId,
    accept: (pattern: OpenPattern) =>
      run(
        pattern.id,
        async (uid) =>
          acceptPattern(uid, await getHelmEncryption(uid), pattern),
        readDone(pattern),
      ),
    confirm: (pattern: OpenPattern) =>
      run(
        pattern.id,
        (uid) => confirmPattern(uid, pattern.id, dayKey),
        HELM_COPY.noticedOfferConfirmed(
          formatDateShortUTC(
            Date.parse(dayKey) +
              PATTERN_BACKOFF_WEEKS[
                Math.min(pattern.declineCount, PATTERN_BACKOFF_WEEKS.length - 1)
              ] *
                WEEK_MS,
          ),
        ),
      ),
    notNow: (pattern: OpenPattern) => {
      const weeks = readNotNowWeeks(pattern);
      return run(
        pattern.id,
        (uid) => notNowPattern(uid, pattern.id, dayKey),
        HELM_COPY.noticedOfferNotNow(
          weeks === null
            ? null
            : formatDateShortUTC(Date.parse(dayKey) + weeks * WEEK_MS),
        ),
      );
    },
    stop: (pattern: OpenPattern) =>
      run(
        pattern.id,
        (uid) => stopPattern(uid, pattern.id),
        HELM_COPY.noticedOfferStopped,
      ),
    retire: (pattern: OpenPattern) =>
      run(
        pattern.id,
        (uid) => retirePattern(uid, pattern.id),
        HELM_COPY.noticedOfferRetired,
      ),
    reopen: (pattern: OpenPattern) =>
      run(
        pattern.id,
        (uid) => reopenPattern(uid, pattern.id),
        HELM_COPY.noticedOfferReopened,
      ),
    takeBack: (pattern: OpenPattern) =>
      run(
        pattern.id,
        async (uid) => {
          const result = await undoPattern(
            uid,
            await getHelmEncryption(uid),
            pattern,
          );
          return result.kind === 'done'
            ? 'saved'
            : result.kind === 'offline'
              ? 'offline'
              : 'missing';
        },
        HELM_COPY.patternTookBackReport,
      ),
    forgetWords: (pattern: OpenPattern, observationIds: string[]) =>
      run(
        pattern.id,
        async (uid) => {
          await forgetWords(uid, pattern.id, observationIds);
          return 'saved';
        },
        HELM_COPY.noticedWordsForgotten,
      ),
  };
}
