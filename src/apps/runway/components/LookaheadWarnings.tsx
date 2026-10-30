import { useState } from 'react';
import { ChevronRight, TriangleAlert } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import InlineNotice from '@/components/InlineNotice';
import DetailSheet from '@/components/DetailSheet';
import ShowMoreButton from '@/components/ShowMoreButton';
import SensitiveValue from '@/components/SensitiveValue';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import { formatDateUTC } from '@/utils/formatUtils';
import {
  CARD_WORDS,
  FIX_ROWS_SHOWN,
  FIX_WORDS,
  PROBLEM_WORDS,
} from '@apps/runway/constants';
import {
  describeGroupShort,
  groupProblems,
  type ProblemGroup,
} from '@apps/runway/utils/lookaheadText';
import {
  describeDueCard,
  describeDueNote,
  getCardName,
} from '@apps/runway/utils/cardText';
import type { DueCard } from '@apps/runway/engine/cards';
import type { Lookahead } from '@apps/runway/engine/lookahead';
import CardSheets, {
  type OpenedCard,
} from '@apps/runway/components/CardSheets';
import DueCardRow from '@apps/runway/components/DueCardRow';
import { selectAllCards } from '@apps/runway/store/selectors/runwaySelectors';
import NeedsALookRow from '@apps/runway/components/NeedsALookRow';
import ProblemRow from '@apps/runway/components/ProblemRow';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';

interface LookaheadWarningsProps {
  /** Null before the plan can look ahead (no income yet); cards coming due still warn. */
  lookahead: Lookahead | null;
  /** Cards coming due with money waiting; each is its own row beside the plan's problems. */
  dueCards?: readonly DueCard[];
}

type WarningRow =
  { kind: 'plan'; group: ProblemGroup } | { kind: 'card'; due: DueCard };

const getRowKey = (row: WarningRow) => {
  if (row.kind === 'card') return `card:${row.due.card.id}`;
  const { group } = row;
  if (group.kind === 'undated') return 'undated';
  if (group.kind === 'day') return `day:${group.on}:${group.dayKey}`;
  return `single:${group.on}:${group.problem.kind}`;
};

/** What stops the plan, as one warning row that counts the rest; it opens "Things to fix", one row per problem, soonest first. The open list lives in the URL, so coming back from a row's day lands on it again. */
function LookaheadWarnings({
  lookahead,
  dueCards = [],
}: LookaheadWarningsProps) {
  const { isFixesOpen, openFixes, closeFixes } = useRunwayUrlState();
  const { isHidden } = useValuesHidden();
  const incomeEndsOn = lookahead?.incomeEndsOn ?? null;
  const [isAllShown, setIsAllShown] = useState(false);
  const [paying, setPaying] = useState<OpenedCard | null>(null);
  const allCards = useAppSelector(selectAllCards);
  const undated = lookahead?.undated ?? [];
  const rows: WarningRow[] = [
    ...[
      ...groupProblems(lookahead?.problems ?? []).map((group) => ({
        on: group.on,
        row: { kind: 'plan', group } satisfies WarningRow,
      })),
      ...dueCards.map((due) => ({
        on: due.dueOn,
        row: { kind: 'card', due } satisfies WarningRow,
      })),
    ]
      .sort((a, b) => a.on - b.on)
      .map(({ row }) => row),
    ...(undated.length === 0
      ? []
      : [
          {
            kind: 'plan',
            group: { kind: 'undated', bills: undated },
          } satisfies WarningRow,
        ]),
  ];
  const first = rows[0] ?? null;
  // A card coming due is not a gap in the plan, so a list of only cards is not "things to fix".
  const isCardsOnly =
    rows.length > 0 && rows.every((row) => row.kind === 'card');
  const words = isCardsOnly
    ? {
        title: CARD_WORDS.comingDueTitle,
        one: CARD_WORDS.comingDueOne,
        many: CARD_WORDS.comingDueMany,
      }
    : PROBLEM_WORDS;
  const describeDue = (due: DueCard) =>
    describeDueCard(getCardName(due.card, allCards), due);
  const openPay = (due: DueCard) => {
    closeFixes();
    setPaying({ cardId: due.card.id, view: 'pay' });
  };
  const endsText =
    incomeEndsOn === null
      ? null
      : FIX_WORDS.incomeEnds(formatDateUTC(incomeEndsOn));

  if (rows.length === 0 && !endsText) return null;
  const label = !first
    ? { before: endsText ?? '', figure: null, after: '' }
    : first.kind === 'plan'
      ? describeGroupShort(first.group, isHidden)
      : { before: describeDue(first.due), figure: null, after: '' };
  const more = rows.length - 1;
  const moreText = rows.every(
    (row) => row.kind === 'plan' && row.group.kind === 'day',
  )
    ? `${more} more ${more === 1 ? 'day' : 'days'}`
    : `${more} more`;
  const isCounted = rows.length > 0;
  const shown = isAllShown ? rows : rows.slice(0, FIX_ROWS_SHOWN);

  if (isHidden) {
    return (
      <>
        <NeedsALookRow />
        <DetailSheet
          isOpen={isFixesOpen}
          onClose={closeFixes}
          title={words.title}
        >
          {isFixesOpen && <NeedsALookRow />}
        </DetailSheet>
      </>
    );
  }
  return (
    <>
      <Button
        type='button'
        variant='tertiary'
        className='text-foreground! h-auto min-h-11 w-full items-center justify-start gap-3 rounded-2xl border border-(--runway-warning-edge) bg-(--runway-warning-soft) px-3! py-1.5 text-left font-normal whitespace-normal'
        onClick={openFixes}
      >
        <span
          className='grid size-8 shrink-0 place-items-center rounded-full bg-(--runway-warning-edge)/40 text-(--runway-warning-ink)'
          aria-hidden='true'
        >
          <TriangleAlert className='h-4 w-4' />
        </span>
        <span className='min-w-0 flex-1 text-sm font-medium'>
          {isCounted && (
            <span className='sm:hidden'>
              {rows.length === 1 ? words.one : words.many(rows.length)}
            </span>
          )}
          <span className={join(isCounted && 'max-sm:hidden')}>
            {label.before}
            {label.figure !== null && (
              <SensitiveValue>{label.figure}</SensitiveValue>
            )}
            {label.after}
            {more > 0 && (
              <span className='text-muted-foreground font-normal whitespace-nowrap'>
                {' '}
                · {moreText}
              </span>
            )}
          </span>
        </span>
        <ChevronRight
          className='text-muted-foreground h-4 w-4 shrink-0'
          aria-hidden='true'
        />
      </Button>
      <DetailSheet
        isOpen={isFixesOpen}
        onClose={closeFixes}
        title={words.title}
        actions={<ValuesEyeButton />}
      >
        {isFixesOpen && rows.length > 0 && (
          <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
            {shown.map((row) => (
              <li
                key={getRowKey(row)}
                className='first:[&>button]:rounded-t-2xl last:[&>button]:rounded-b-2xl'
              >
                {row.kind === 'card' ? (
                  <DueCardRow
                    sentence={describeDue(row.due)}
                    note={describeDueNote(row.due)}
                    onOpen={() => openPay(row.due)}
                  />
                ) : (
                  <ProblemRow group={row.group} />
                )}
              </li>
            ))}
            {rows.length > FIX_ROWS_SHOWN && (
              <li className='px-3 py-1'>
                <ShowMoreButton
                  isOpen={isAllShown}
                  onClick={() => setIsAllShown((current) => !current)}
                >
                  {isAllShown
                    ? 'Show fewer'
                    : `Show ${rows.length - FIX_ROWS_SHOWN} more`}
                </ShowMoreButton>
              </li>
            )}
          </ul>
        )}
        {isFixesOpen && endsText !== null && (
          <InlineNotice tone='info' className='mt-3'>
            {endsText}
          </InlineNotice>
        )}
      </DetailSheet>
      <CardSheets cards={allCards} open={paying} onChange={setPaying} />
    </>
  );
}

export default LookaheadWarnings;
