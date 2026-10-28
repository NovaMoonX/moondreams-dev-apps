import { useState } from 'react';
import { FileText } from 'lucide-react';

import BeforeAfterRow from '@/components/BeforeAfterRow';
import EmptyCard from '@/components/EmptyCard';
import SectionDivider from '@/components/SectionDivider';
import ShowMoreButton from '@/components/ShowMoreButton';
import Subview from '@/components/Subview';
import { useAppSelector } from '@/store';
import { formatDateTime, formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import RecordLineRow from '@apps/runway/components/RecordLineRow';
import {
  CONFIRM_WORDS,
  CORRECT_WORDS,
  DRAFT_WORDS,
} from '@apps/runway/constants';
import {
  selectConfirmedRecord,
  selectEffectiveSplit,
  selectRecordChain,
  selectIsRecordsReady,
  selectOpenDay,
  selectProposedRecord,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { RecordDifference } from '@apps/runway/types';

interface RecordScreenProps {
  dayKey: string;
  onClose: () => void;
}

interface FigureProps {
  label: string;
  planned: number;
  confirmed: number;
  /** What the confirmed figure is called when it differs from the planned one. */
  confirmedWord: string;
}

/** One figure kept twice: what the draft expected and what was confirmed. */
function Figure({ label, planned, confirmed, confirmedWord }: FigureProps) {
  const mask = useMaskedText();
  return (
    <li className='space-y-0.5 p-3'>
      <p className='text-muted-foreground text-xs'>{label}</p>
      <div className='flex flex-wrap items-baseline justify-between gap-x-3'>
        <p className='text-sm'>
          {CONFIRM_WORDS.planned}{' '}
          <span className='font-medium whitespace-nowrap tabular-nums'>
            {mask(formatCents(planned))}
          </span>
        </p>
        <p className='text-sm'>
          {confirmedWord}{' '}
          <span className='font-semibold whitespace-nowrap tabular-nums'>
            {mask(formatCents(confirmed))}
          </span>
        </p>
      </div>
    </li>
  );
}

const describeDifference = (
  difference: RecordDifference,
  hasLineChanges: boolean,
  isHidden: boolean,
) => {
  if (isHidden) {
    return difference.kind === 'amount'
      ? CONFIRM_WORDS.hiddenAmountDiffered
      : CONFIRM_WORDS.hiddenLineDiffered(
          difference.name === '' ? DRAFT_WORDS.billFallback : difference.name,
        );
  }
  if (difference.kind === 'amount') {
    return `${formatCents(difference.actualCents)} arrived against ${formatCents(difference.plannedCents)} expected.${
      hasLineChanges
        ? ''
        : ` ${
            difference.actualCents > difference.plannedCents
              ? CONFIRM_WORDS.extraTo
              : CONFIRM_WORDS.shortFrom
          }`
    }`;
  }
  const change = difference.actualCents - difference.plannedCents;
  const name =
    difference.name === '' ? DRAFT_WORDS.billFallback : difference.name;
  return change > 0
    ? `${formatCents(change)} more went to ${name}.`
    : `${formatCents(-change)} came out of ${name}.`;
};

/** A confirmed day as it was planned and as it was confirmed: the figures, each difference with its note, and the lines that matched folded away. */
function RecordScreen({ dayKey, onClose }: RecordScreenProps) {
  const [isMatchedOpen, setIsMatchedOpen] = useState(false);
  const { isHidden } = useValuesHidden();
  const mask = useMaskedText();
  const isReady = useAppSelector(selectIsRecordsReady);
  const day = useAppSelector((state) => selectOpenDay(state, dayKey));
  const proposed = useAppSelector((state) =>
    selectProposedRecord(state, dayKey),
  );
  const confirmed = useAppSelector((state) =>
    selectConfirmedRecord(state, dayKey),
  );

  const chain = useAppSelector((state) => selectRecordChain(state, dayKey));
  const current = useAppSelector((state) =>
    selectEffectiveSplit(state, dayKey),
  );
  const corrections = chain.flatMap((record) =>
    record.kind === 'correction' ? [record] : [],
  );

  const getBody = () => {
    if (!isReady) {
      return <p className='text-muted-foreground text-sm'>Getting this day.</p>;
    }
    if (!proposed || !confirmed) {
      return (
        <EmptyCard icon={<FileText className='h-5 w-5' />}>
          {CONFIRM_WORDS.missingRecords}
        </EmptyCard>
      );
    }
    const before = new Map(proposed.payload.lines.map((l) => [l.lineId, l]));
    const rows = confirmed.payload.lines.map((line) => ({
      line,
      plannedCents: before.get(line.lineId)?.cents ?? 0,
    }));
    const differing = rows.filter((row) => row.plannedCents !== row.line.cents);
    const matched = rows.filter((row) => row.plannedCents === row.line.cents);
    const { differences } = confirmed.payload;
    const isUntouched = differences.length === 0 && differing.length === 0;
    const hasLineChanges = differences.some((d) => d.kind === 'line');
    const notes = new Map(
      differences.flatMap((difference) =>
        difference.kind === 'line'
          ? [[difference.lineId, difference.note]]
          : [],
      ),
    );

    return (
      <div className='space-y-4'>
        <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
          <Figure
            label='Money'
            planned={proposed.payload.expectedCents}
            confirmed={confirmed.payload.arrivedCents}
            confirmedWord={CONFIRM_WORDS.arrived}
          />
          <Figure
            label={DRAFT_WORDS.dayLeft}
            planned={proposed.payload.freeToSpendCents}
            confirmed={confirmed.payload.freeToSpendCents}
            confirmedWord={CONFIRM_WORDS.confirmed}
          />
        </ul>
        {differences.length > 0 && (
          <div className='space-y-2'>
            <SectionDivider label='What differed' />
            <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
              {differences.map((difference) => (
                <li
                  key={
                    difference.kind === 'line'
                      ? difference.lineId
                      : difference.kind
                  }
                  className='space-y-1 p-3 text-sm'
                >
                  <p>
                    {describeDifference(difference, hasLineChanges, isHidden)}
                  </p>
                  {difference.kind === 'amount' && difference.note && (
                    <p className='break-words'>{difference.note}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {differing.length > 0 && (
          <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
            {differing.map(({ line, plannedCents }) => (
              <RecordLineRow
                key={line.lineId}
                line={line}
                plannedCents={plannedCents}
                note={notes.get(line.lineId) ?? null}
              />
            ))}
          </ul>
        )}
        {isUntouched && (
          <p className='text-muted-foreground text-sm'>
            {CONFIRM_WORDS.unchanged}
          </p>
        )}
        {matched.length > 0 && (
          <div className='space-y-2'>
            {!isUntouched && (
              <ShowMoreButton
                isOpen={isMatchedOpen}
                onClick={() => setIsMatchedOpen((open) => !open)}
              >
                {matched.length === 1
                  ? '1 item matched the plan'
                  : `${matched.length} items matched the plan`}
              </ShowMoreButton>
            )}
            {(isMatchedOpen || isUntouched) && (
              <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                {matched.map(({ line }) => (
                  <RecordLineRow key={line.lineId} line={line} />
                ))}
              </ul>
            )}
          </div>
        )}
        {corrections.length > 0 && (
          <div className='space-y-2'>
            <SectionDivider label={CORRECT_WORDS.history} />
            {corrections.map((correction, index) => (
              <div key={correction.id} className='space-y-2'>
                <p className='text-sm'>
                  <span className='font-medium'>
                    {formatDateTime(correction.createdAt)}
                  </span>
                  {index === corrections.length - 1 && (
                    <span className='text-muted-foreground'>
                      {' '}
                      · {CORRECT_WORDS.currentTag}
                    </span>
                  )}
                </p>
                <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                  <BeforeAfterRow
                    title={DRAFT_WORDS.dayLeft}
                    before={mask(
                      formatCents(correction.payload.before.freeToSpendCents),
                    )}
                    after={mask(
                      formatCents(correction.payload.freeToSpendCents),
                    )}
                    beforeLabel={CORRECT_WORDS.before}
                    afterLabel={CORRECT_WORDS.corrected}
                    detail={
                      correction.payload.note ? (
                        <p className='text-sm break-words'>
                          {correction.payload.note}
                        </p>
                      ) : undefined
                    }
                  />
                  {correction.payload.changes.map((change) => (
                    <BeforeAfterRow
                      key={change.lineId}
                      title={
                        change.name === ''
                          ? DRAFT_WORDS.billFallback
                          : change.name
                      }
                      before={mask(formatCents(change.beforeCents))}
                      after={mask(formatCents(change.afterCents))}
                      beforeLabel={CORRECT_WORDS.before}
                      afterLabel={CORRECT_WORDS.corrected}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {corrections.length > 0 && current && (
          <div className='space-y-2'>
            <SectionDivider label={CORRECT_WORDS.current} />
            <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
              {current.lines.map((line) => (
                <RecordLineRow key={line.lineId} line={line} />
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  return (
    <Subview
      overlay
      title={CONFIRM_WORDS.recordTitle}
      onClose={onClose}
      headerAction={<ValuesEyeButton />}
    >
      <div className='space-y-4'>
        {day?.arrivedOn != null && (
          <p className='text-muted-foreground text-sm'>
            Expected {formatDateUTC(day.expectedOn)}
            <span className='max-sm:hidden'> · </span>
            <span className='max-sm:block'>
              Arrived {formatDateUTC(day.arrivedOn)}
            </span>
          </p>
        )}
        {getBody()}
      </div>
    </Subview>
  );
}

export default RecordScreen;
