import { formatDateShortUTC, formatDateUTC } from '@/utils/formatUtils';
import { formatCents, formatCentsShort } from '@/utils/moneyUtils';
import { FIX_WORDS } from '@apps/runway/constants';
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
  const result = `On ${formatDateUTC(problem.on)}, the plan leaves ${name} ${formatCents(problem.shortBy)} short.`;
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

/** One problem in a few words, in the plan's terms: "The plan leaves Rent $30 short on Nov 1". */
export function describeProblemShort(problem: LookaheadProblem) {
  const name = problem.name === '' ? 'A bill' : problem.name;
  const on = formatDateShortUTC(problem.on).replace(/ /g, '\u00a0');
  if (problem.kind === 'overdue')
    return `${name} was due ${on}, not marked paid`;
  if (problem.kind === 'noIncome')
    return `${name} on ${on} has no income before it`;
  const result = `The plan leaves ${name} ${formatCentsShort(problem.shortBy)} short on ${on}`;
  return result;
}

/** The problems soonest first, the order the summary row and the list it opens both use. */
export function sortProblems(problems: readonly LookaheadProblem[]) {
  const result = [...problems].sort((a, b) => a.on - b.on);
  return result;
}

/** One problem as a list row: what is short or missing, and on which day. */
export function describeProblemRow(problem: LookaheadProblem) {
  const name = problem.name === '' ? 'A bill' : problem.name;
  const on = formatDateShortUTC(problem.on);
  if (problem.kind === 'overdue') {
    return { title: FIX_WORDS.notPaid(name), detail: FIX_WORDS.dueOn(on) };
  }
  if (problem.kind === 'noIncome') {
    return { title: FIX_WORDS.noIncome(name), detail: FIX_WORDS.dueOn(on) };
  }
  return {
    title: FIX_WORDS.short(name, formatCentsShort(problem.shortBy)),
    detail: FIX_WORDS.runsShortOn(on),
  };
}
