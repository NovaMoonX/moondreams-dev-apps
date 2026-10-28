import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import type {
  Lookahead,
  LookaheadProblem,
} from '@apps/runway/engine/lookahead';

/** One problem in a sentence: what stops the plan, on which day, never as missing money. */
export function describeProblem(problem: LookaheadProblem) {
  const name = problem.name === '' ? 'A bill' : problem.name;
  if (problem.kind === 'overdue') {
    return `${name} was due ${formatDateUTC(problem.on)} and is not marked paid.`;
  }
  if (problem.kind === 'noIncome') {
    return `${name} on ${formatDateUTC(problem.on)} has no income before it is due.`;
  }
  const result = `On ${formatDateUTC(problem.on)}, the plan leaves ${name} short by ${formatCents(problem.shortBy)}.`;
  return result;
}

/** The headline: how far the plan holds, or null when there is nothing to hold yet. */
export function describeHoldsThrough(lookahead: Lookahead) {
  if (lookahead.holdsThrough === null) return null;
  const result = `Your plan holds through ${formatDateUTC(lookahead.holdsThrough)}`;
  return result;
}

/** What a change does to how far the plan holds, in one sentence; null when there is nothing to say. */
export function describeHoldsChange(before: Lookahead, after: Lookahead) {
  const key = (look: Lookahead) =>
    JSON.stringify([look.holdsThrough, look.problems[0] ?? null]);
  if (key(before) === key(after)) {
    return after.holdsThrough === null
      ? null
      : `Your plan still holds through ${formatDateUTC(after.holdsThrough)}.`;
  }
  const first = after.problems[0];
  if (after.holdsThrough === null) {
    return first ? `With this change, ${describeProblem(first)}` : null;
  }
  if (before.holdsThrough === after.holdsThrough) {
    const still = `Your plan still holds through ${formatDateUTC(after.holdsThrough)}.`;
    return first
      ? `${still} With this change, ${describeProblem(first)}`
      : still;
  }
  const was =
    before.holdsThrough === null
      ? ''
      : ` instead of ${formatDateUTC(before.holdsThrough)}`;
  const result = `Your plan would hold through ${formatDateUTC(after.holdsThrough)}${was}.`;
  return result;
}
