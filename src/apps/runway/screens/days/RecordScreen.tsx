import { useState } from 'react';
import { FileText } from 'lucide-react';

import EmptyCard from '@/components/EmptyCard';
import SectionDivider from '@/components/SectionDivider';
import ShowMoreButton from '@/components/ShowMoreButton';
import Subview from '@/components/Subview';
import { useAppSelector } from '@/store';
import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import RecordLineRow from '@apps/runway/components/RecordLineRow';
import { CONFIRM_WORDS, DRAFT_WORDS } from '@apps/runway/constants';
import {
  selectConfirmedRecord,
  selectIsRecordsReady,
  selectOpenDay,
  selectProposedRecord,
} from '@apps/runway/store/selectors/runwaySelectors';

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
  return (
    <li className='space-y-0.5 p-3'>
      <p className='text-muted-foreground text-xs'>{label}</p>
      <div className='flex flex-wrap items-baseline justify-between gap-x-3'>
        <p className='text-sm'>
          {CONFIRM_WORDS.planned}{' '}
          <span className='font-medium whitespace-nowrap tabular-nums'>
            {formatCents(planned)}
          </span>
        </p>
        <p className='text-sm'>
          {confirmedWord}{' '}
          <span className='font-semibold whitespace-nowrap tabular-nums'>
            {formatCents(confirmed)}
          </span>
        </p>
      </div>
    </li>
  );
}

/** A confirmed day as it was planned and as it was confirmed: the figures, each difference with its note, and the lines that matched folded away. */
function RecordScreen({ dayKey, onClose }: RecordScreenProps) {
  const [isMatchedOpen, setIsMatchedOpen] = useState(false);
  const isReady = useAppSelector(selectIsRecordsReady);
  const day = useAppSelector((state) => selectOpenDay(state, dayKey));
  const proposed = useAppSelector((state) =>
    selectProposedRecord(state, dayKey),
  );
  const confirmed = useAppSelector((state) =>
    selectConfirmedRecord(state, dayKey),
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
            label={DRAFT_WORDS.freeToSpend}
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
                <li key={difference.kind} className='space-y-1 p-3 text-sm'>
                  <p>
                    {formatCents(difference.actualCents)} arrived against{' '}
                    {formatCents(difference.plannedCents)} expected.
                  </p>
                  <p className='text-muted-foreground'>
                    {difference.actualCents > difference.plannedCents
                      ? CONFIRM_WORDS.extraTo
                      : CONFIRM_WORDS.shortFrom}
                  </p>
                  {difference.note && (
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
              />
            ))}
          </ul>
        )}
        {matched.length > 0 && (
          <div className='space-y-2'>
            <ShowMoreButton
              isOpen={isMatchedOpen}
              onClick={() => setIsMatchedOpen((open) => !open)}
            >
              {matched.length === 1
                ? '1 line matched the draft'
                : `${matched.length} lines matched the draft`}
            </ShowMoreButton>
            {isMatchedOpen && (
              <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                {matched.map(({ line }) => (
                  <RecordLineRow key={line.lineId} line={line} />
                ))}
              </ul>
            )}
          </div>
        )}
        {differences.length === 0 && differing.length === 0 && (
          <p className='text-muted-foreground text-sm'>
            {CONFIRM_WORDS.unchanged}
          </p>
        )}
      </div>
    );
  };

  return (
    <Subview overlay title={CONFIRM_WORDS.recordTitle} onClose={onClose}>
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
