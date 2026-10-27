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

/** What a change does to how far the plan holds, as one sentence; null when there is nothing to say. */
export function describeHoldsChange(before: Lookahead, after: Lookahead) {
  const blocks = describeHoldsBlocks(before, after);
  const result =
    blocks.length === 0 ? null : blocks.map((block) => block.text).join(' ');
  return result;
}

export interface HoldsBlock {
  tone: 'success' | 'warning';
  text: string;
  /** The amount inside `text`, so it can be drawn in the warning colour. */
  figure: string | null;
}

/** A problem as the end of "With this change, ...": lower case after the comma, the day short. */
function describeChangeProblem(problem: LookaheadProblem, more: number) {
  const name = problem.name === '' ? 'A bill' : problem.name;
  const on = formatDateShortUTC(problem.on);
  const tail =
    more > 0
      ? ` ${more} more ${more === 1 ? 'item needs' : 'items need'} a look.`
      : '';
  if (problem.kind === 'overdue') {
    return {
      text: `With this change, ${name} was due ${on} and is not marked paid.${tail}`,
      figure: null,
    };
  }
  if (problem.kind === 'noIncome') {
    return {
      text: `With this change, ${name} on ${on} has no income before it is due.${tail}`,
      figure: null,
    };
  }
  const figure = formatCentsShort(problem.shortBy);
  return {
    text: `With this change, the plan leaves ${name} ${figure} short on ${on}.${tail}`,
    figure,
  };
}

/** What a change does to how far the plan holds, as separate blocks: the plan holding is one idea, a shortfall another. */
export function describeHoldsBlocks(
  before: Lookahead,
  after: Lookahead,
): HoldsBlock[] {
  const holds = (through: number): HoldsBlock => ({
    tone: 'success',
    text:
      isSameLookahead(before, after) || before.holdsThrough === through
        ? `Your plan still holds through ${formatDateUTC(through)}.`
        : `Your plan would hold through ${formatDateUTC(through)}${
            before.holdsThrough === null
              ? ''
              : ` instead of ${formatDateUTC(before.holdsThrough)}`
          }.`,
    figure: null,
  });
  if (isSameLookahead(before, after)) {
    return after.holdsThrough === null ? [] : [holds(after.holdsThrough)];
  }
  const [first] = sortProblems(after.problems);
  const problem: HoldsBlock[] = first
    ? [
        {
          tone: 'warning',
          ...describeChangeProblem(first, after.problems.length - 1),
        },
      ]
    : [];
  if (after.holdsThrough === null) return problem;
  if (before.holdsThrough === after.holdsThrough)
    return [holds(after.holdsThrough), ...problem];
  return [holds(after.holdsThrough)];
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
