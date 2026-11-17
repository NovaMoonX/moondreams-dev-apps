import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Loader2, X } from 'lucide-react';

import InlineNotice from '@/components/InlineNotice';
import SectionDivider from '@/components/SectionDivider';
import AnswerField from '@apps/helm/components/home/AnswerField';
import AimRows from '@apps/helm/components/dayCard/AimRows';
import { CAPTURE_MAX_CHARS, HELM_COPY } from '@apps/helm/constants';
import type { AimRow, CarryRow } from '@apps/helm/hooks/useDayCard';
import type { OpenTask } from '@apps/helm/types';
import { formatAimLength } from '@apps/helm/utils/dayCard';

interface MorningCardProps {
  rows: AimRow[];
  carry: CarryRow[];
  fitLine: string | null;
  isRest: boolean;
  filing: 'none' | 'filing' | 'offline' | 'failed';
  isPlanFailed: boolean;
  heldIds: ReadonlySet<string>;
  onSend: (text: string) => Promise<boolean>;
  onBring: (row: CarryRow) => void;
  onLeaveOff: (row: CarryRow) => void;
  onSkip: () => void;
  onTick: (task: OpenTask) => void;
  onUndoTick: (taskId: string) => void;
  onFixLength: (row: AimRow) => void;
  onOpenToday: () => void;
  onRetryPlan: () => void;
}

/** The first thing home asks each day: what the person wants done, with yesterday's leftovers above the field. What is said is filed through the normal turn, so the card shows "Filing…" until the day's aims arrive. */
function MorningCard({
  rows,
  carry,
  fitLine,
  isRest,
  filing,
  isPlanFailed,
  heldIds,
  onSend,
  onBring,
  onLeaveOff,
  onSkip,
  onTick,
  onUndoTick,
  onFixLength,
  onOpenToday,
  onRetryPlan,
}: MorningCardProps) {
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const send = async () => {
    setIsSending(true);
    const isSent = await onSend(text);
    setIsSending(false);
    if (isSent) setText('');
  };
  const isFiling = filing === 'filing' || filing === 'offline';

  return (
    <section className='helm-card space-y-4 p-4'>
      <div className='flex items-start justify-between gap-2'>
        <h2 className='helm-serif min-w-0 text-[20px] leading-6 text-pretty'>
          {HELM_COPY.dayAimsQuestion}
        </h2>
        <Button
          type='button'
          variant='tertiary'
          size='icon'
          rounded='full'
          aria-label={HELM_COPY.dayAimsSkip}
          className="text-muted-foreground relative -mt-1 -mr-2 size-8 min-h-0 min-w-0 shrink-0 p-0 after:absolute after:-inset-1 after:content-['']"
          onClick={onSkip}
        >
          <X className='size-4' aria-hidden='true' />
        </Button>
      </div>
      <AimRows
        rows={rows}
        fitLine={fitLine}
        isRest={isRest}
        heldIds={heldIds}
        onTick={onTick}
        onUndoTick={onUndoTick}
        onFixLength={onFixLength}
        onOpenToday={onOpenToday}
      />
      {isPlanFailed && (
        <InlineNotice tone='warning'>
          <p>{HELM_COPY.dayAimsPlanFailed}</p>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            className='mt-2'
            onClick={onRetryPlan}
          >
            {HELM_COPY.dayAimsTryAgain}
          </Button>
        </InlineNotice>
      )}
      {carry.length > 0 && !isFiling && (
        <div className='space-y-1'>
          <SectionDivider label={HELM_COPY.dayAimsFromYesterday} />
          <ul className='divide-border divide-y'>
            {carry.map((row) => (
              <li key={row.taskId} className='space-y-2 py-3'>
                <p className='text-[15px] leading-[21px] break-words'>
                  {row.title}
                  {row.minutes !== null && (
                    <span className='text-muted-foreground text-[13px]'>
                      {` · ${formatAimLength(row.minutes)}`}
                    </span>
                  )}
                </p>
                <div className='flex items-center justify-between gap-3'>
                  <Button
                    type='button'
                    size='sm'
                    className='relative after:absolute after:-inset-x-1 after:-inset-y-1.5'
                    onClick={() => onBring(row)}
                  >
                    {HELM_COPY.dayAimsBring}
                  </Button>
                  <Button
                    type='button'
                    variant='tertiary'
                    size='sm'
                    className='relative after:absolute after:-inset-x-1 after:-inset-y-1.5'
                    onClick={() => onLeaveOff(row)}
                  >
                    {HELM_COPY.dayAimsNotToday}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {isFiling ? (
        <p
          role='status'
          className='text-muted-foreground flex items-start gap-2 text-[15px] text-pretty'
        >
          {filing === 'filing' && (
            <Loader2
              className='mt-1 size-4 shrink-0 animate-spin motion-reduce:animate-none'
              aria-hidden='true'
            />
          )}
          <span className='min-w-0 break-words'>
            {filing === 'offline'
              ? HELM_COPY.dayAimsFilingOffline
              : HELM_COPY.dayAimsFiling}
          </span>
        </p>
      ) : (
        <>
          {filing === 'failed' && (
            <p className='text-muted-foreground text-[13px] text-pretty'>
              {HELM_COPY.dayAimsFailedFiling}
            </p>
          )}
          <AnswerField
            label={HELM_COPY.dayAimsField}
            placeholder={HELM_COPY.dayAimsPlaceholder}
            value={text}
            onChange={setText}
            onSend={() => void send()}
            isDisabled={isSending}
            maxLength={CAPTURE_MAX_CHARS}
            isMultiline
          />
        </>
      )}
    </section>
  );
}

export default MorningCard;
