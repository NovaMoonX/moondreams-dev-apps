import { HELM_COPY } from '@apps/helm/constants';
import { useResultLines } from '@apps/helm/hooks/useResultLines';
import { getUndoneDocIds } from '@apps/helm/nomos/planUndo';
import type { OpenExecution } from '@apps/helm/types';
import { buildUndoUnits, getRemainingUnits } from '@apps/helm/utils/undoUnits';

/** The units still left to take back and one choice per unit, worded as the card's rows are: the first row's title, the other rows as its detail. */
export function useUndoChoices(execution: OpenExecution) {
  const lines = useResultLines(execution);
  const units = getRemainingUnits(
    buildUndoUnits(execution).units,
    getUndoneDocIds(execution),
  );
  const choices = units.map((unit) => {
    const [first, ...rest] = lines.filter((line) => line.unitKey === unit.key);
    return {
      key: unit.key,
      title: first?.title ?? unit.title ?? HELM_COPY.activityMadeChange,
      detail:
        rest.length > 0
          ? rest.map((row) => row.title).join(' · ')
          : (first?.detail ?? null),
    };
  });
  return { units, choices };
}
