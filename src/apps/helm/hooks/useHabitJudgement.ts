import { useEffect, useRef } from 'react';

import { useAppSelector } from '@/store';
import { useHabitClock } from '@apps/helm/hooks/useHabitClock';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import {
  judgeHabitsOnOpen,
  readJudgementWork,
} from '@apps/helm/store/actions/habitJudgementActions';

/** On the first open of a week, judges last week for each running habit that has not been, re-judges a late check-in, and tells any stage change nobody has been told. Online only; each pass is attempted once per work it found. */
export function useHabitJudgement(uid: string | null) {
  const keyStatus = useAppSelector((state) => state.helm.keyStatus);
  const habits = useAppSelector((state) => state.helm.habits);
  const clock = useHabitClock();
  const tried = useRef('');
  const work = readJudgementWork(habits.items, clock.dayKey);
  const signature = [...work.due, ...work.untold]
    .map(
      (habit) =>
        `${habit.id}:${habit.stageWeek}:${habit.rejudgeFrom}:${habit.untoldSince}`,
    )
    .join('|');
  const isReady = keyStatus === 'ready' && habits.isLoaded && signature !== '';

  useEffect(() => {
    if (!uid || !isReady || tried.current === signature) return;
    if (!navigator.onLine) return;
    tried.current = signature;
    getHelmEncryption(uid)
      .then((encryption) =>
        judgeHabitsOnOpen(
          uid,
          habits.items,
          clock.dayKey,
          clock.timeZone,
          encryption,
        ),
      )
      .catch((error: unknown) =>
        console.error('Helm habit stages were not judged', error),
      );
  }, [uid, isReady, signature, habits.items, clock.dayKey, clock.timeZone]);
}
