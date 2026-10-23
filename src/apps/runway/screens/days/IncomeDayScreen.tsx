import { Mail } from 'lucide-react';

import EmptyCard from '@/components/EmptyCard';
import SectionDivider from '@/components/SectionDivider';
import Subview from '@/components/Subview';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import CoverageHeadline from '@apps/runway/components/CoverageHeadline';
import DraftLine from '@apps/runway/components/DraftLine';
import { DRAFT_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  selectDraft,
  selectIsPlanItemsLoaded,
} from '@apps/runway/store/selectors/runwaySelectors';

interface IncomeDayScreenProps {
  dayKey: string;
  onClose: () => void;
}

/** What one coming income day does with its money, worked out each time and never stored. */
function IncomeDayScreen({ dayKey, onClose }: IncomeDayScreenProps) {
  const today = todayAsUtcDate(useNow(60_000));
  const isLoaded = useAppSelector(selectIsPlanItemsLoaded);
  const view = useAppSelector((state) => selectDraft(state, dayKey, today));

  if (!view) {
    return (
      <Subview title='Income day' onClose={onClose}>
        <p className='text-muted-foreground text-sm'>
          {isLoaded ? 'This income day is not coming up.' : 'Getting this day.'}
        </p>
      </Subview>
    );
  }

  const { day, draft, envelopes, sourceNames } = view;
  const funded = draft.lines.filter((line) => line.shortBy === 0);
  const unfunded = draft.lines.filter((line) => line.shortBy > 0);
  const title = day.sourceName ?? day.payLineName;

  const renderLine = (line: (typeof draft.lines)[number]) => {
    const envelope = Object.hasOwn(envelopes, line.itemId)
      ? envelopes[line.itemId]
      : { name: 'Envelope', emoji: null };
    return (
      <DraftLine
        key={line.lineId}
        line={line}
        name={envelope.name}
        emoji={envelope.emoji}
        sourceNames={sourceNames}
      />
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
            {formatDateUTC(day.on)}
            <span className='max-sm:hidden'> · </span>
            <span className='max-sm:block'>
              {formatCents(draft.moneyCents)}
            </span>
          </p>
        </div>
        <CoverageHeadline
          freeCents={draft.freeToSpend.cents}
          moneyCents={draft.moneyCents}
        />
        {draft.lines.length === 0 ? (
          <EmptyCard icon={<Mail className='h-5 w-5' />}>
            Nothing is set to be funded from this day. Add an envelope in Plan
            and it will show here.
          </EmptyCard>
        ) : (
          <div className='space-y-4'>
            {funded.length > 0 && (
              <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                {funded.map(renderLine)}
              </ul>
            )}
            {unfunded.length > 0 && (
              <div className='space-y-2'>
                <SectionDivider label={DRAFT_WORDS.notFunded} />
                <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                  {unfunded.map(renderLine)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Subview>
  );
}

export default IncomeDayScreen;
