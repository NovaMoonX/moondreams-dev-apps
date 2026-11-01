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
  | { kind: 'single'; on: number; problem: LookaheadProblem }
  | {
      kind: 'undated';
      bills: readonly { billId: string; name: string }[];
    };

export type DatedProblemGroup = Exclude<ProblemGroup, { kind: 'undated' }>;

/** The problems soonest first, one group per income day that runs short: the order the summary row and the list it opens both use. */
export function groupProblems(problems: readonly LookaheadProblem[]) {
  const sorted = [...problems].sort((a, b) => a.on - b.on);
  const result = sorted.reduce<DatedProblemGroup[]>((groups, problem) => {
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

/** A day's short lines as one sentence: three in full, then "and N more". With amounts hidden it names what runs short and gives no figure. */
function listShorts(shorts: readonly ShortProblem[], isHidden: boolean) {
  const shown = shorts
    .slice(0, 3)
    .map((item) =>
      isHidden
        ? getName(item)
        : `${getName(item)} ${formatCentsShort(item.shortBy)}`,
    );
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
export function describeGroupRow(group: ProblemGroup, isHidden = false) {
  if (group.kind === 'undated') {
    return {
      title: FIX_WORDS.needsDate(group.bills.map(({ name }) => name)),
      detail: FIX_WORDS.nothingSetAside(group.bills.length),
    };
  }
  if (group.kind === 'single') return describeProblemRow(group.problem);
  const result = {
    title: formatDateShortUTC(group.on),
    detail: listShorts(group.shorts, isHidden),
  };
  return result;
}

/** The first group in a few words, split around its one figure so only the figure is masked: "The plan leaves Rent [$30] short on Nov 1". */
export function describeGroupShort(group: ProblemGroup, isHidden = false) {
  if (group.kind === 'undated') {
    return {
      before: FIX_WORDS.needsDate(group.bills.map(({ name }) => name)),
      figure: null,
      after: '',
    };
  }
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
  if (isHidden) {
    return {
      before: `The plan leaves ${getName(only)} short on ${on}`,
      figure: null,
      after: '',
    };
  }
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
function describeChangeProblem(
  problem: LookaheadProblem,
  more: number,
  isHidden: boolean,
  grewBy: number | null = null,
) {
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
  if (isHidden) {
    return {
      text: `With this change, the plan leaves ${name} short on ${on}.${tail}`,
      figure: null,
    };
  }
  const figure = formatCentsShort(grewBy ?? problem.shortBy);
  return {
    text: `With this change, the plan leaves ${name} ${figure}${grewBy === null ? '' : ' more'} short on ${on}.${tail}`,
    figure,
  };
}

const getProblemKey = (problem: LookaheadProblem) =>
  `${problem.kind}:${problem.kind === 'short' ? problem.itemId : problem.billId}`;

export interface CreatedProblem {
  problem: LookaheadProblem;
  /** For a shortfall that already existed and grew: how much more it is short; null for a problem that is new. */
  grewBy: number | null;
}

/**
 * The problems a change creates or makes worse, matched one to one against what the plan already had:
 * a problem is old only when the same item has the same kind on the same day or earlier with at least
 * the same shortfall. A problem on an earlier day, an extra day or a bigger shortfall is the change's.
 */
export function getCreatedProblems(
  before: readonly LookaheadProblem[],
  after: readonly LookaheadProblem[],
): CreatedProblem[] {
  const sortedAfter = [...after].sort((a, b) => a.on - b.on);
  const result = sortedAfter.reduce<{
    used: readonly LookaheadProblem[];
    created: CreatedProblem[];
  }>(
    (acc, candidate) => {
      const key = getProblemKey(candidate);
      const matches = before.filter(
        (entry) =>
          !acc.used.includes(entry) &&
          getProblemKey(entry) === key &&
          entry.on <= candidate.on,
      );
      const covers = matches.find(
        (entry) =>
          candidate.kind !== 'short' ||
          (entry.kind === 'short' && entry.shortBy >= candidate.shortBy),
      );
      if (covers) return { ...acc, used: [...acc.used, covers] };
      const [grown] = matches
        .filter((entry) => entry.kind === 'short')
        .sort(
          (a, b) =>
            (b.kind === 'short' ? b.shortBy : 0) -
            (a.kind === 'short' ? a.shortBy : 0),
        );
      return {
        used: grown ? [...acc.used, grown] : acc.used,
        created: [
          ...acc.created,
          {
            problem: candidate,
            grewBy:
              grown && grown.kind === 'short' && candidate.kind === 'short'
                ? candidate.shortBy - grown.shortBy
                : null,
          },
        ],
      };
    },
    { used: [], created: [] },
  );
  return result.created;
}

/** What a change does to how far the plan holds, as separate blocks: the plan holding is one idea, a shortfall another. */
export function describeHoldsBlocks(
  before: Lookahead,
  after: Lookahead,
  isHidden = false,
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
  const created = getCreatedProblems(before.problems, after.problems).sort(
    (a, b) => (sortProblems([a.problem, b.problem])[0] === a.problem ? -1 : 1),
  );
  const [first] = created;
  const problem: HoldsBlock[] = first
    ? [
        {
          tone: 'warning',
          ...describeChangeProblem(
            first.problem,
            created.length - 1,
            isHidden,
            first.grewBy,
          ),
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
