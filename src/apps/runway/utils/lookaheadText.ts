import {
  formatDateOrdinalUTC,
  formatRelativeDayUTC,
} from '@/utils/formatUtils';
import { formatCents, formatCentsShort } from '@/utils/moneyUtils';
import { COVERAGE_WORDS, FIX_WORDS } from '@apps/runway/constants';
import {
  isSameLookahead,
  sortProblems,
  type Lookahead,
  type LookaheadProblem,
} from '@apps/runway/engine/lookahead';

export { isSameLookahead, sortProblems };

/** "today", "tomorrow" or "on Nov 18": the day a problem falls on, counted from `today`. */
const onDay = (on: number, today: number) => {
  if (on <= today) return 'today';
  const relative = formatRelativeDayUTC(on, today, formatDateOrdinalUTC);
  return relative === 'tomorrow' ? relative : `on ${relative}`;
};

/** How far the plan covers every bill, counted from today in words that need no year to read: "Your plan covers every bill for the next 12 months", "Your plan comes up short tomorrow". */
export function describeCoverage(lookahead: Lookahead, today: number) {
  const [first] = sortProblems(lookahead.problems);
  if (first) {
    return {
      isClear: false,
      text: `${COVERAGE_WORDS.shortLead} ${onDay(first.on, today)}`,
    };
  }
  if (lookahead.incomeEndsOn !== null) {
    return {
      isClear: true,
      text: COVERAGE_WORDS.untilIncomeEnds(
        formatDateOrdinalUTC(lookahead.incomeEndsOn),
      ),
    };
  }
  return { isClear: true, text: COVERAGE_WORDS.clear };
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
export function describeGroupRow(
  group: ProblemGroup,
  today: number,
  isHidden = false,
) {
  if (group.kind === 'undated') {
    return {
      title: FIX_WORDS.needsDate(group.bills.map(({ name }) => name)),
      detail: FIX_WORDS.nothingSetAside(group.bills.length),
    };
  }
  if (group.kind === 'single') return describeProblemRow(group.problem, today);
  const result = {
    title: formatDateOrdinalUTC(group.on),
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
  const on = formatDateOrdinalUTC(group.on).replace(/ /g, '\u00a0');
  if (group.kind === 'single') {
    const problem = group.problem;
    if (problem.kind === 'noIncome' && problem.reason === 'short') {
      return isHidden
        ? {
            before: `The plan leaves ${getName(problem)} short on ${on}`,
            figure: null,
            after: '',
          }
        : {
            before: `The plan leaves ${getName(problem)} `,
            figure: formatCentsShort(problem.shortBy),
            after: ` short on ${on}`,
          };
    }
    const before =
      problem.kind === 'noIncome' && problem.reason === 'noPick'
        ? `${getName(problem)} on ${on} comes from a pay that is not before it`
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
  tone: 'success' | 'warning' | 'info';
  text: string;
  /** The amount inside `text`, so it can be drawn in the warning colour. */
  figure: string | null;
  /** The text says why a one-time pay leaves the bill short. */
  hasNote?: boolean;
}

/** A problem as the end of "With this change, ...": lower case after the comma, the day short. */
function describeChangeProblem(
  problem: LookaheadProblem,
  more: number,
  isHidden: boolean,
  note: string | null,
  grewBy: number | null = null,
) {
  const name = problem.name === '' ? 'A bill' : problem.name;
  const on = formatDateOrdinalUTC(problem.on);
  const tail =
    more > 0
      ? ` ${more} more ${more === 1 ? 'item needs' : 'items need'} a look.`
      : '';
  if (problem.kind === 'noIncome' && problem.reason !== 'short') {
    return {
      text: `With this change, ${name} on ${on} ${problem.reason === 'noPick' ? 'is set to come from a pay that is not before it is due' : 'has no income before it is due'}.${tail}`,
      figure: null,
    };
  }
  if (isHidden) {
    return {
      text: `With this change, the plan leaves ${name} short on ${on}.${tail}`,
      figure: null,
    };
  }
  const figure = formatCents(grewBy ?? problem.shortBy);
  const why = note === null || problem.kind !== 'short' ? '' : `: ${note}`;
  return {
    text: `With this change, the plan leaves ${name} ${figure}${grewBy === null ? '' : ' more'} short on ${on}${why}.${tail}`,
    figure,
    hasNote: why !== '',
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
  const isAmount = (problem: LookaheadProblem) =>
    problem.kind === 'short' || problem.reason === 'short';
  const shortOf = (problem: LookaheadProblem) =>
    isAmount(problem) && 'shortBy' in problem ? problem.shortBy : 0;
  const biggestFirst = [...after].sort((a, b) => shortOf(b) - shortOf(a));
  const matched = biggestFirst.reduce<{
    used: readonly LookaheadProblem[];
    results: Map<LookaheadProblem, CreatedProblem | null>;
  }>(
    (acc, candidate) => {
      const key = getProblemKey(candidate);
      const open = before
        .filter(
          (entry) =>
            !acc.used.includes(entry) &&
            getProblemKey(entry) === key &&
            entry.on <= candidate.on,
        )
        .sort((a, b) => shortOf(a) - shortOf(b));
      const covers = open.find(
        (entry) => !isAmount(candidate) || shortOf(entry) >= shortOf(candidate),
      );
      const grown = covers ? undefined : open[open.length - 1];
      const taken = covers ?? grown;
      return {
        used: taken ? [...acc.used, taken] : acc.used,
        results: new Map(acc.results).set(
          candidate,
          covers
            ? null
            : {
                problem: candidate,
                grewBy:
                  grown && isAmount(candidate) && isAmount(grown)
                    ? shortOf(candidate) - shortOf(grown)
                    : null,
              },
        ),
      };
    },
    { used: [], results: new Map() },
  );
  return after.flatMap((problem) => matched.results.get(problem) ?? []);
}

/** What a change does to how far the plan holds, as separate blocks: the plan holding is one idea, a shortfall another. */
export function describeHoldsBlocks(
  before: Lookahead,
  after: Lookahead,
  isHidden = false,
  /** Why a pay is short, by its day key ("Freelance payment is one-time and brings $120"). */
  notes: Readonly<Record<string, string>> = {},
): HoldsBlock[] {
  const holds = (): HoldsBlock => {
    const [first] = sortProblems(after.problems);
    if (first) {
      return {
        tone: 'info',
        text: COVERAGE_WORDS.stillShort(formatDateOrdinalUTC(first.on)),
        figure: null,
      };
    }
    const ends = after.incomeEndsOn;
    const isSame =
      isSameLookahead(before, after) ||
      (before.problems.length === 0 && before.incomeEndsOn === ends);
    const coverage =
      ends === null
        ? COVERAGE_WORDS.clearTail
        : COVERAGE_WORDS.untilIncomeEndsTail(formatDateOrdinalUTC(ends));
    const movedFrom =
      ends !== null &&
      before.problems.length === 0 &&
      before.incomeEndsOn !== null &&
      before.incomeEndsOn !== ends
        ? ` instead of ${formatDateOrdinalUTC(before.incomeEndsOn)}`
        : '';
    return {
      tone: 'success',
      text: isSame
        ? `Your plan still ${coverage}.`
        : `With this change your plan ${coverage}${movedFrom}.`,
      figure: null,
    };
  };
  if (isSameLookahead(before, after)) {
    return after.holdsThrough === null && after.problems.length === 0
      ? []
      : [holds()];
  }
  const found = getCreatedProblems(before.problems, after.problems);
  const created = sortProblems(found.map((entry) => entry.problem)).flatMap(
    (problem) => found.filter((entry) => entry.problem === problem),
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
            first.problem.kind === 'short'
              ? (notes[first.problem.dayKey] ?? null)
              : null,
            first.grewBy,
          ),
        },
      ]
    : [];
  if (problem.length > 0 || after.problems.length > 0) return problem;
  return after.holdsThrough === null && after.problems.length === 0
    ? []
    : [holds()];
}

/** One problem in a few words, in the plan's terms: "The plan leaves Rent $30 short on Nov 1". */
export function describeProblemShort(problem: LookaheadProblem) {
  const name = problem.name === '' ? 'A bill' : problem.name;
  const on = formatDateOrdinalUTC(problem.on).replace(/ /g, '\u00a0');
  if (problem.kind === 'noIncome' && problem.reason === 'noIncome')
    return `${name} on ${on} has no income before it`;
  if (problem.kind === 'noIncome' && problem.reason === 'noPick')
    return `${name} on ${on} comes from a pay that is not before it`;
  const result = `The plan leaves ${name} ${formatCentsShort(problem.shortBy)} short on ${on}`;
  return result;
}

/** One problem as a list row: what is short or missing, and on which day. */
export function describeProblemRow(problem: LookaheadProblem, today: number) {
  const name = problem.name === '' ? 'A bill' : problem.name;
  const on = formatDateOrdinalUTC(problem.on);
  if (problem.kind === 'noIncome' && problem.reason !== 'short') {
    return {
      title:
        problem.reason === 'noPick'
          ? FIX_WORDS.noPick(name)
          : FIX_WORDS.noIncome(name),
      detail: FIX_WORDS.dueOn(
        formatRelativeDayUTC(problem.on, today, formatDateOrdinalUTC),
      ),
    };
  }
  return {
    title: FIX_WORDS.short(name, formatCentsShort(problem.shortBy)),
    detail: FIX_WORDS.runsShortOn(on),
  };
}
