import { useState } from 'react';
import { ChevronRight, FileText, Pencil } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import EmptyCard from '@/components/EmptyCard';
import SectionDivider from '@/components/SectionDivider';
import Subview from '@/components/Subview';
import { useAppSelector } from '@/store';
import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import CoverageHeadline from '@apps/runway/components/CoverageHeadline';
import RecordLineRow from '@apps/runway/components/RecordLineRow';
import {
  CONFIRM_WORDS,
  CORRECT_WORDS,
  DRAFT_WORDS,
} from '@apps/runway/constants';
import CorrectSheet from '@apps/runway/screens/days/CorrectSheet';
import ChecklistScreen from '@apps/runway/screens/days/ChecklistScreen';
import RecordScreen from '@apps/runway/screens/days/RecordScreen';
import {
  selectEffectiveSplit,
  selectIsRecordsReady,
  type ListedDay,
} from '@apps/runway/store/selectors/runwaySelectors';

interface ConfirmedDayViewProps {
  day: ListedDay;
  onClose: () => void;
}

/** A confirmed day: what arrived, where it went, and a door to what was planned against it. */
function ConfirmedDayView({ day, onClose }: ConfirmedDayViewProps) {
  const [isRecordOpen, setIsRecordOpen] = useState(false);
  const isReady = useAppSelector(selectIsRecordsReady);
  const [isCorrecting, setIsCorrecting] = useState(false);
  const record = useAppSelector((state) =>
    selectEffectiveSplit(state, day.dayKey),
  );
  const title = day.sourceName ?? day.payLineName;

  const getBody = () => {
    if (!isReady) {
      return <p className='text-muted-foreground text-sm'>Getting this day.</p>;
    }
    if (!record) {
      return (
        <EmptyCard icon={<FileText className='h-5 w-5' />}>
          {CONFIRM_WORDS.missingRecords}
        </EmptyCard>
      );
    }
    const { arrivedCents, freeToSpendCents, lines } = record;
    const funded = lines.filter((line) => line.shortBy === 0);
    const unfunded = lines.filter((line) => line.shortBy > 0);
    return (
      <div className='space-y-4'>
        <CoverageHeadline
          freeCents={freeToSpendCents}
          moneyCents={arrivedCents}
        />
        <ChecklistScreen day={day} lines={lines} />
        <Button
          type='button'
          variant='tertiary'
          className='border-border h-auto min-h-11 w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-left font-normal whitespace-normal'
          onClick={() => setIsRecordOpen(true)}
        >
          <span className='min-w-0 flex-1 break-words'>
            {CONFIRM_WORDS.recordDoor}
          </span>
          <ChevronRight className='text-muted-foreground h-4 w-4 shrink-0' />
        </Button>
        <Button
          type='button'
          variant='tertiary'
          className='border-border h-auto min-h-11 w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-left font-normal whitespace-normal'
          onClick={() => setIsCorrecting(true)}
        >
          <Pencil className='text-muted-foreground h-4 w-4 shrink-0' />
          <span className='min-w-0 flex-1'>
            <span className='block break-words'>{CORRECT_WORDS.door}</span>
            <span className='text-muted-foreground block text-sm break-words'>
              {CORRECT_WORDS.doorHint}
            </span>
          </span>
          <ChevronRight className='text-muted-foreground h-4 w-4 shrink-0' />
        </Button>
        {lines.length === 0 ? (
          <EmptyCard icon={<FileText className='h-5 w-5' />}>
            Nothing was set to be funded from this day.
          </EmptyCard>
        ) : (
          <div className='space-y-4'>
            {funded.length > 0 && (
              <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                {funded.map((line) => (
                  <RecordLineRow key={line.lineId} line={line} />
                ))}
              </ul>
            )}
            {unfunded.length > 0 && (
              <div className='space-y-2'>
                <SectionDivider label={DRAFT_WORDS.notFunded} />
                <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                  {unfunded.map((line) => (
                    <RecordLineRow key={line.lineId} line={line} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Subview title='Income day' onClose={onClose}>
      <div className='space-y-4'>
        <div>
          <p className='line-clamp-2 text-lg font-medium break-words'>
            {title}
          </p>
          <p className='text-muted-foreground text-sm'>
            {CONFIRM_WORDS.confirmed}
            {day.arrivedOn !== null && (
              <>
                <span className='max-sm:hidden'> · </span>
                <span className='max-sm:block'>
                  Arrived {formatDateUTC(day.arrivedOn)}
                </span>
              </>
            )}
          </p>
          {record && (
            <p className='text-muted-foreground text-sm'>
              {formatCents(record.arrivedCents)} arrived
              {record.kind === 'correction' && ` · ${CORRECT_WORDS.corrected}`}
            </p>
          )}
        </div>
        {getBody()}
      </div>
      {isCorrecting && record && (
        <CorrectSheet
          key={record.recordId}
          dayKey={day.dayKey}
          base={record}
          onClose={() => setIsCorrecting(false)}
        />
      )}
      {isRecordOpen && (
        <RecordScreen
          dayKey={day.dayKey}
          onClose={() => setIsRecordOpen(false)}
        />
      )}
    </Subview>
  );
}

export default ConfirmedDayView;
