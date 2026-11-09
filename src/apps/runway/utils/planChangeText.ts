import { formatCentsShort } from '@/utils/moneyUtils';
import { PLAN_CHANGE_WORDS } from '@apps/runway/constants';
import type { PlanChange } from '@apps/runway/engine/planChanges';
import type { OpenVersion } from '@apps/runway/types';

interface Figure {
  text: string;
  isZero: boolean;
}

const fromRange = (range: { lowCents: number; highCents: number }): Figure => ({
  text:
    range.lowCents === range.highCents
      ? formatCentsShort(range.lowCents)
      : `${formatCentsShort(range.lowCents)} to ${formatCentsShort(range.highCents)}`,
  isZero: range.highCents === 0,
});

const zero = (): Figure => ({ text: formatCentsShort(0), isZero: true });

/** What an item puts in or takes out each time, in the words a short line uses; null when its amount is a share or whatever is left. */
const getFigure = (version: OpenVersion): Figure | null => {
  if (version.kind === 'payLine' || version.kind === 'bill') {
    return fromRange(version.payload.amount);
  }
  if (version.kind === 'envelope' || version.kind === 'goal') {
    if (version.kind === 'goal' && version.payload.state === 'paused') {
      return zero();
    }
    const { amount, cadence } = version.payload.funding;
    if (cadence.kind === 'none') return zero();
    if (amount.kind === 'exact') {
      return {
        text: formatCentsShort(amount.cents),
        isZero: amount.cents === 0,
      };
    }
  }
  return null;
};

/** A change as one row: "Rent · $1,250 → $0", "Gym returns to $40". Carries amounts, so it is drawn masked. */
export function describePlanChange(change: PlanChange): string {
  const name = change.after.payload.name;
  const before = getFigure(change.before);
  const after = getFigure(change.after);
  if (change.isReturn) {
    return after
      ? PLAN_CHANGE_WORDS.rowReturns(name, after.text)
      : PLAN_CHANGE_WORDS.rowReturnsPlain(name);
  }
  if (before && after && before.text !== after.text) {
    return PLAN_CHANGE_WORDS.rowChanges(name, before.text, after.text);
  }
  return PLAN_CHANGE_WORDS.rowChangesPlain(name);
}

/** A change with no figure in it: "Rent stops", "Gym returns", "Groceries changes". */
export function describePlanChangeShort(change: PlanChange): string {
  const name = change.after.payload.name;
  if (change.isReturn) return PLAN_CHANGE_WORDS.returns(name);
  const after = getFigure(change.after);
  const before = getFigure(change.before);
  return after?.isZero && !before?.isZero
    ? PLAN_CHANGE_WORDS.stops(name)
    : PLAN_CHANGE_WORDS.changes(name);
}

/** Up to three short changes joined with a dot, then "and N more". */
export function describePlanChanges(changes: readonly PlanChange[]): string {
  const shown = changes.slice(0, 3).map(describePlanChangeShort).join(' · ');
  const rest = changes.length - 3;
  return rest > 0 ? `${shown} ${PLAN_CHANGE_WORDS.more(rest)}` : shown;
}
