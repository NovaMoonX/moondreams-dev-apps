import { useState } from 'react';
import { FileText, Pencil } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';

import EmptyCard from '@/components/EmptyCard';
import SectionDivider from '@/components/SectionDivider';
import Subview from '@/components/Subview';
import { useAppSelector } from '@/store';
import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { MaskedText } from '@apps/runway/components/MaskedText';
import CoverageHeadline from '@apps/runway/components/CoverageHeadline';
import RecordLineRow from '@apps/runway/components/RecordLineRow';
import {
  CONFIRM_WORDS,
  CORRECT_WORDS,
  DAYS_WORDS,
  DRAFT_WORDS,
  ITEM_SHEET_R2_WORDS,
  ITEM_SHEET_WORDS,
  NEEDS_LOOK_WORDS,
} from '@apps/runway/constants';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { formatDayTitle } from '@apps/runway/utils/dayTitle';
import CorrectSheet from '@apps/runway/screens/days/CorrectSheet';
import ChecklistScreen from '@apps/runway/screens/days/ChecklistScreen';
import RecordScreen from '@apps/runway/screens/days/RecordScreen';
import {
  selectEffectiveSplit,
  selectIsDayCorrectable,
  selectIsDayRecordsReady,
  type ListedDay,
} from '@apps/runway/store/selectors/runwaySelectors';

interface ConfirmedDayViewProps {
  day: ListedDay;
  onClose: () => void;
}

/** A confirmed day: what arrived, where it went, and a door to what was planned against it. */
function ConfirmedDayView({ day, onClose }: ConfirmedDayViewProps) {
  const { isHidden } = useValuesHidden();
  const [isRecordOpen, setIsRecordOpen] = useState(false);
  const isReady = useAppSelector((state) =>
    selectIsDayRecordsReady(state, day.dayKey),
  );
  const isCorrectable = useAppSelector((state) =>
    selectIsDayCorrectable(state, day.dayKey),
  );
  const [isCorrecting, setIsCorrecting] = useState(false);
  const record = useAppSelector((state) =>
    selectEffectiveSplit(state, day.dayKey),
  );
  const title = day.sourceName ?? day.payLineName;
  const items = useAppSelector((state) => state.runway.items);
  const billIds = new Set(
    items.filter((item) => item.kind === 'bill').map((item) => item.id),
  );

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
    const { freeToSpendCents, lines } = record;
    const otherLines = isCorrectable
      ? lines.filter((line) => !(billIds.has(line.itemId) && line.cents > 0))
      : lines;
    const funded = otherLines.filter((line) => line.shortBy === 0);
    const unfunded = otherLines.filter((line) => line.shortBy > 0);
    const dayLeft = <CoverageHeadline freeCents={freeToSpendCents} />;
    return (
      <div className='space-y-4'>
        {isCorrectable && <ChecklistScreen day={day} lines={lines} />}
        {lines.length === 0 ? (
          <EmptyCard icon={<FileText className='h-5 w-5' />}>
            Nothing was set to be funded from this day.
          </EmptyCard>
        ) : (
          <div className='space-y-4'>
            <div className='space-y-2'>
              <SectionDivider label={ITEM_SHEET_R2_WORDS.setAsideHeading} />
              {funded.length > 0 && (
                <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                  {funded.map((line) => (
                    <RecordLineRow key={line.lineId} line={line} />
                  ))}
                </ul>
              )}
              {dayLeft}
            </div>
            {unfunded.length > 0 && (
              <div className='space-y-2'>
                <SectionDivider
                  label={
                    isHidden ? NEEDS_LOOK_WORDS.short : DRAFT_WORDS.notFunded
                  }
                />
                <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                  {unfunded.map((line) => (
                    <RecordLineRow key={line.lineId} line={line} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <ActionGroup isRoomy caption={ITEM_SHEET_WORDS.dayMore}>
          <ActionRow
            isGrouped
            isRoomy
            hasChevron
            icon={<FileText />}
            label={CONFIRM_WORDS.recordDoor}
            onClick={() => setIsRecordOpen(true)}
          />
          {isCorrectable && (
            <ActionRow
              isGrouped
              isRoomy
              hasChevron
              icon={<Pencil />}
              label={CORRECT_WORDS.door}
              subtitle={CORRECT_WORDS.doorHint}
              onClick={() => setIsCorrecting(true)}
            />
          )}
        </ActionGroup>
        {!isCorrectable && (
          <p className='text-muted-foreground text-sm'>
            {DAYS_WORDS.readOnlyNote}
          </p>
        )}
      </div>
    );
  };

  return (
    <Subview
      title={formatDayTitle(day.on)}
      onClose={onClose}
      headerAction={<ValuesEyeButton />}
    >
      <div className='space-y-4'>
        <div className='border-border bg-accent rounded-2xl border p-4'>
          <p className='text-muted-foreground text-sm font-medium break-words'>
            {day.sourceName ? `${title}, ${day.payLineName}` : title}
          </p>
          {record && (
            <p className='text-4xl font-semibold tracking-tight tabular-nums'>
              <MaskedText>{formatCents(record.arrivedCents)}</MaskedText>
            </p>
          )}
          <p className='text-muted-foreground text-sm'>
            {[
              CONFIRM_WORDS.confirmed,
              day.arrivedOn !== null
                ? `arrived ${formatDateUTC(day.arrivedOn)}`
                : null,
              record?.kind === 'correction'
                ? CORRECT_WORDS.corrected.toLowerCase()
                : null,
            ]
              .filter(Boolean)
              .join(', ')}
          </p>
        </div>
        {getBody()}
      </div>
      {isCorrecting && isCorrectable && record && (
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
