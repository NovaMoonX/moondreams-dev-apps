import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { HELM_COPY } from '@apps/helm/constants';
import { habitDayKey } from '@apps/helm/engine/habitDay';
import {
  tallyHabit,
  tickHabit,
  untallyHabit,
  untickHabit,
} from '@apps/helm/store/actions/habitDayWrites';
import type { HabitLine } from '@apps/helm/utils/habitToday';

/** What a tap on a habit's line writes: a tick, a skip, a tally and the Undo of each. Handed back unawaited so it works offline. */
export function useHabitChecks(uid: string | null, timeZone: string) {
  const { addToast } = useToast();
  const fail = (error: unknown) => {
    console.error('Helm habit check was not saved', error);
    addToast({ title: HELM_COPY.habitNotSaved, type: 'error' });
  };

  const check = (line: HabitLine, status: 'done' | 'skipped') => {
    if (!uid || line.kind !== 'tick') return;
    const at = Date.now();
    tickHabit(uid, habitDayKey(at, timeZone), line.habit.id, line.windowId, {
      status,
      at,
      by: 'person',
      executionId: null,
    }).catch(fail);
  };

  const undoCheck = (line: HabitLine) => {
    if (!uid || line.kind !== 'tick') return;
    untickHabit(
      uid,
      habitDayKey(line.check?.at ?? Date.now(), timeZone),
      line.habit.id,
      line.windowId,
    ).catch(fail);
  };

  const tally = (line: HabitLine) => {
    if (!uid || line.kind !== 'tally') return;
    const at = Date.now();
    tallyHabit(uid, habitDayKey(at, timeZone), line.habit.id, at).catch(fail);
  };

  const undoTally = (line: HabitLine) => {
    if (!uid || line.kind !== 'tally' || line.count < 1) return;
    untallyHabit(
      uid,
      habitDayKey(line.lastAt ?? Date.now(), timeZone),
      line.habit.id,
    ).catch(fail);
  };

  return { check, undoCheck, tally, undoTally };
}
