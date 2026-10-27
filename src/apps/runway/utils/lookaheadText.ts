import { formatDateShortUTC, formatDateUTC } from '@/utils/formatUtils';
import { formatCents, formatCentsShort } from '@/utils/moneyUtils';
import { FIX_WORDS } from '@apps/runway/constants';
import {
  isSameLookahead,
  sortProblems,
  type Lookahead,
  type LookaheadProblem,
} from '@apps/runway/engine/lookahead';

export { isSameLookahead, sortProblems };

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
  if (isSameLookahead(before, after)) {
    return after.holdsThrough === null
      ? null
      : `Your plan still holds through ${formatDateUTC(after.holdsThrough)}.`;
  }
  const [first] = sortProblems(after.problems);
  const more = after.problems.length - 1;
  const describeFirst = (problem: LookaheadProblem) =>
    `With this change, ${describeProblem(problem)}${more > 0 ? ` ${more} more ${more === 1 ? 'item needs' : 'items need'} a look.` : ''}`;
  if (after.holdsThrough === null) {
    return first ? describeFirst(first) : null;
  }
  if (before.holdsThrough === after.holdsThrough) {
    const still = `Your plan still holds through ${formatDateUTC(after.holdsThrough)}.`;
    return first ? `${still} ${describeFirst(first)}` : still;
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
