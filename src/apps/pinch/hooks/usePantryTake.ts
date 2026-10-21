import { useCallback, useState } from 'react';

import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { usePackageActions } from '@apps/pinch/hooks/usePackageActions';
import {
  TAKE_REFUSED,
  type ChangedPackage,
} from '@apps/pinch/store/actions/packageActions';
import {
  selectIngredientsById,
  selectPackages,
} from '@apps/pinch/store/selectors';
import {
  getTakeGroups,
  planTakeOut,
  type TakeGroup,
  type TakeLine,
} from '@apps/pinch/utils/packages';

interface Taken {
  groups: TakeGroup[];
  changed: ChangedPackage[];
}

/** What cooking would take out of the pantry, held by the cooking screen so it survives going back a step: the proposal while nothing is taken, what was taken once it is (with the Undo), and never a second proposal for what a take already used. */
export function usePantryTake(uid: string, lines: TakeLine[]) {
  const { takeOut, undoChanges, isReady } = usePackageActions(uid);
  const packages = useAppSelector(selectPackages);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const [left, setLeft] = useState<ReadonlySet<string>>(new Set());
  const [taken, setTaken] = useState<Taken | null>(null);
  const [busy, setBusy] = useState<'TAKE' | 'UNDO' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getName = useCallback(
    (ingredientId: string) =>
      ingredientsById.get(ingredientId)?.name ?? 'Removed ingredient',
    [ingredientsById],
  );
  const plan = planTakeOut(lines, packages, undefined, (ingredientId) => {
    const ingredient = ingredientsById.get(ingredientId);
    return {
      gramsPerMl: ingredient?.gramsPerMl ?? null,
      gramsEach: ingredient?.gramsEach ?? null,
    };
  });
  const groups = getTakeGroups(plan, getName);
  const chosen = plan.takes.filter((take) => !left.has(take.ingredientId));

  const toggle = (ingredientId: string) =>
    setLeft((current) =>
      current.has(ingredientId)
        ? new Set([...current].filter((id) => id !== ingredientId))
        : new Set([...current, ingredientId]),
    );

  const take = async () => {
    if (busy !== null || chosen.length === 0) return;

    setError(null);
    setBusy('TAKE');
    try {
      const result = await takeOut(chosen, () => setTaken(null));
      if (result === undefined) return;

      if (result.changed.length === 0) {
        setError(TAKE_REFUSED);
        return;
      }
      const takenIds = new Set(result.changed.map((entry) => entry.id));
      setTaken({
        groups: getTakeGroups(
          {
            takes: chosen.filter((entry) => takenIds.has(entry.packageId)),
            short: plan.short,
          },
          getName,
        ),
        changed: result.changed,
      });
    } catch (takeError) {
      setError(
        `${getErrorMessage(takeError, "Couldn't take it out.")} You can do it from Pantry.`,
      );
    } finally {
      setBusy(null);
    }
  };

  const undo = async () => {
    if (busy !== null || taken === null) return;

    setError(null);
    setBusy('UNDO');
    try {
      const restored = await undoChanges(taken.changed);
      if (restored > 0) setTaken(null);
    } finally {
      setBusy(null);
    }
  };

  return {
    isReady,
    groups,
    short: plan.short,
    left,
    toggle,
    chosenCount: chosen.length,
    taken,
    busy,
    error,
    take,
    undo,
  };
}

export type PantryTake = ReturnType<typeof usePantryTake>;
