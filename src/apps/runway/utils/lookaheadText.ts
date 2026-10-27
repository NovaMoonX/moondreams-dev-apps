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

type ShortProblem = Extract<LookaheadProblem, { kind: 'short' }>;

/** One row of "Things to fix": every short line on one income day together, or one problem that is not tied to a day. */
export type ProblemGroup =
  | { kind: 'day'; on: number; dayKey: string; shorts: ShortProblem[] }
  | { kind: 'single'; on: number; problem: LookaheadProblem };

/** The problems soonest first, one group per income day that runs short: the order the summary row and the list it opens both use. */
export function groupProblems(problems: readonly LookaheadProblem[]) {
  const sorted = [...problems].sort((a, b) => a.on - b.on);
  const result = sorted.reduce<ProblemGroup[]>((groups, problem) => {
    if (problem.kind !== 'short') {
      return [...groups, { kind: 'single', on: problem.on, problem }];
    }
    const index = groups.findIndex(
      (group) => group.kind === 'day' && group.dayKey === problem.dayKey,
    );
    if (index < 0) {
      return [
        ...groups,
        {
          kind: 'day',
          on: problem.on,
          dayKey: problem.dayKey,
          shorts: [problem],
        },
      ];
    }
    return groups.map((group, at) =>
      at === index && group.kind === 'day'
        ? { ...group, shorts: [...group.shorts, problem] }
        : group,
    );
  }, []);
  return result;
}

const getName = (problem: LookaheadProblem) =>
  problem.name === '' ? 'A bill' : problem.name;

/** A day's short lines as one sentence: three in full, then "and N more". */
function listShorts(shorts: readonly ShortProblem[]) {
  const shown = shorts
    .slice(0, 3)
    .map((item) => `${getName(item)} ${formatCentsShort(item.shortBy)}`);
  const rest = shorts.length - shown.length;
  const joined =
    rest > 0
      ? `${shown.join(', ')} and ${rest} more`
      : shown.length > 1
        ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
        : shown[0];
  return `${joined} short`;
}

/** A group as a list row: the day, and what runs short on it. */
export function describeGroupRow(group: ProblemGroup) {
  if (group.kind === 'single') return describeProblemRow(group.problem);
  const result = {
    title: formatDateShortUTC(group.on),
    detail: listShorts(group.shorts),
  };
  return result;
}

/** The first group in a few words, split around its one figure so only the figure is blurred: "The plan leaves Rent [$30] short on Nov 1". */
export function describeGroupShort(group: ProblemGroup) {
  const on = formatDateShortUTC(group.on).replace(/ /g, '\u00a0');
  if (group.kind === 'single') {
    const problem = group.problem;
    const before =
      problem.kind === 'overdue'
        ? `${getName(problem)} was due ${on}, not marked paid`
        : `${getName(problem)} on ${on} has no income before it`;
    return { before, figure: null, after: '' };
  }
  if (group.shorts.length > 1) {
    return {
      before: `The plan leaves ${group.shorts.length} things short on ${on}`,
      figure: null,
      after: '',
    };
  }
  const only = group.shorts[0];
  return {
    before: `The plan leaves ${getName(only)} `,
    figure: formatCentsShort(only.shortBy),
    after: ` short on ${on}`,
  };
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
  if (after.holdsThrough === null || problem.length > 0) return problem;
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
