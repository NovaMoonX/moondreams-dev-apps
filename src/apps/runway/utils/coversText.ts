import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { HORIZON_WORDS, RANGE_END_WORDS } from '@apps/runway/constants';
import type { HorizonPlan } from '@apps/runway/engine/horizon';
import { getRangeEnd } from '@apps/runway/engine/stance';
import type { Cents, HorizonCost, Stance } from '@apps/runway/types';

const MAX_NAMED = 3;

const listFormat = new Intl.ListFormat('en', {
  style: 'long',
  type: 'conjunction',
});

/** The covers sentence and the costs behind its help icon, worked out once so a comparison and the line itself agree. */
export function readCovers(
  plan: HorizonPlan,
  costs: readonly HorizonCost[],
  heldCents: Cents,
  stance: Stance,
) {
  const words = HORIZON_WORDS.covers;
  const covered = plan.covers.flatMap((cover) => {
    const cost = costs.find(({ id }) => id === cover.costId);
    return cost && cover.coveredCents >= cover.totalCents
      ? [{ cover, cost }]
      : [];
  });
  const ranged = covered.filter(
    ({ cost }) => cost.amount.lowCents !== cost.amount.highCents,
  );
  const endWords = RANGE_END_WORDS[getRangeEnd(stance, 'expense')];
  const groups = covered.reduce<
    { cost: HorizonCost; lastDueOn: number; count: number }[]
  >((list, { cover, cost }) => {
    const group = list.find((entry) => entry.cost.id === cost.id);
    return group
      ? list.map((entry) =>
          entry === group
            ? { ...entry, lastDueOn: cover.dueOn, count: entry.count + 1 }
            : entry,
        )
      : [...list, { cost, lastDueOn: cover.dueOn, count: 1 }];
  }, []);
  const named = groups
    .slice(0, MAX_NAMED)
    .map(({ cost, lastDueOn, count }) =>
      count > 1
        ? words.through(cost.name, formatDateOrdinalUTC(lastDueOn))
        : words.on(cost.name, formatDateOrdinalUTC(lastDueOn)),
    );
  const hasNoEnd = costs.some(
    ({ schedule, ending, isOutside, endsAfter }) =>
      !isOutside &&
      endsAfter === null &&
      schedule.kind !== 'once' &&
      ending.onDate === null &&
      ending.afterCount === null,
  );
  const getText = () => {
    if (plan.covers.length === 0) return null;
    if (heldCents <= 0) return plan.shortfall ? null : words.nothingSet;
    if (covered.length === 0) return plan.shortfall ? null : words.none;
    if (
      covered.length === plan.covers.length &&
      groups.length > MAX_NAMED &&
      !hasNoEnd
    ) {
      return words.all;
    }
    const list = listFormat.format(
      groups.length > MAX_NAMED
        ? [...named, words.more(groups.length - MAX_NAMED)]
        : named,
    );
    return words.listed(list, ranged.length > 0 ? words.atEnd(endWords) : '');
  };
  return { text: getText(), ranged, endWords };
}

/** The covers sentence a line would say, or null when it says nothing; two readings of it differ exactly when their lines would. */
export const getCoversText = (
  plan: HorizonPlan,
  costs: readonly HorizonCost[],
  heldCents: Cents,
  stance: Stance,
) => readCovers(plan, costs, heldCents, stance).text;
