import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import FormSheet from '@/components/FormSheet';

import SectionDivider from '@/components/SectionDivider';
import SegmentedControl from '@/components/SegmentedControl';
import { PillGroup } from '@/components/PillGroup';
import { AimLength, AimTick } from '@apps/helm/components/dayCard/AimRows';
import PrivateTitle from '@apps/helm/components/privacy/PrivateTitle';
import { HELM_COPY, STRUGGLING_TAGS } from '@apps/helm/constants';
import type { AimRow } from '@apps/helm/hooks/useDayCard';
import type { OpenTask, StruggleSignal } from '@apps/helm/types';
import { join } from '@moondreamsdev/dreamer-ui/utils';

type Choice = 'tomorrow' | 'later' | 'dropped';

const CHOICES = [
  { value: 'tomorrow', label: HELM_COPY.windDownTomorrow },
  { value: 'later', label: HELM_COPY.windDownLater },
  { value: 'dropped', label: HELM_COPY.windDownDrop },
] as const;

const REASONS = STRUGGLING_TAGS.map((tag) => ({
  value: tag,
  label: HELM_COPY.dayAimsStruggle[tag],
}));

interface WindDownCardProps {
  rows: AimRow[];
  heldIds: ReadonlySet<string>;
  /** Set once the day is wound down: the same choices, still changeable, with no Done. */
  isReview: boolean;
  onChoose: (row: AimRow, choice: Choice) => void;
  onReason: (row: AimRow, reason: StruggleSignal | null) => void;
  onFinish: () => void;
  onTick: (task: OpenTask) => void;
  onUndoTick: (taskId: string) => void;
  onFixLength: (row: AimRow) => void;
}

/** The last 2 hours of the day: what got done, what is still possible tonight and what won't happen today. Each unfinished aim goes to Tomorrow, Later or Drop it, with an optional reason; neither is required. */
function WindDownCard({
  rows,
  heldIds,
  isReview,
  onChoose,
  onReason,
  onFinish,
  onTick,
  onUndoTick,
  onFixLength,
}: WindDownCardProps) {
  const [reasonRow, setReasonRow] = useState<AimRow | null>(null);
  const isDone = (row: AimRow) => row.isDone || heldIds.has(row.taskId);
  const done = rows.filter(isDone);
  const open = rows.filter((row) => !isDone(row));
  const tonight = open.filter((row) => row.result !== 'wontHappen');
  const wont = open.filter((row) => row.result === 'wontHappen');

  const [changeRow, setChangeRow] = useState<AimRow | null>(null);
  const readChoice = (row: AimRow) =>
    (
      [
        CHOICES.find((choice) => choice.value === row.choice)?.label ??
          HELM_COPY.windDownLeft,
        row.reason ? HELM_COPY.dayAimsStruggle[row.reason] : null,
      ] as (string | null)[]
    )
      .filter((part): part is string => part !== null)
      .join(' · ');
  const renderReviewed = (row: AimRow) => (
    <li key={row.taskId}>
      <Button
        type='button'
        variant='base'
        className='flex h-auto w-full items-center gap-3 rounded-none px-0 py-3 text-left'
        aria-label={HELM_COPY.windDownChange(row.title)}
        onClick={() => setChangeRow(row)}
      >
        <span className='min-w-0 flex-1'>
          <PrivateTitle
            kind='task'
            record={row.task}
            className='text-[15px] leading-[21px]'
          >
            {row.title}
          </PrivateTitle>
          <span className='text-muted-foreground block text-[13px]'>
            {readChoice(row)}
          </span>
        </span>
        <ChevronRight
          className='text-muted-foreground size-4 shrink-0'
          aria-hidden='true'
        />
      </Button>
    </li>
  );
  const choiceControl = (row: AimRow) => (
    <SegmentedControl<Choice | 'unset'>
      label={HELM_COPY.windDownChoice(row.title)}
      options={CHOICES}
      value={row.choice ?? 'unset'}
      onChange={(choice) => {
        if (choice !== 'unset' && choice !== row.choice) {
          onChoose(row, choice);
        }
      }}
    />
  );
  const renderOpen = (row: AimRow) => (
    <li key={row.taskId} className='space-y-3 py-3'>
      <div className='flex items-start gap-3'>
        {row.result !== 'wontHappen' && (
          <span className='mt-0.5'>
            <AimTick
              title={row.title}
              isDone={false}
              onTick={() => onTick(row.task)}
              onUndoTick={() => onUndoTick(row.taskId)}
            />
          </span>
        )}
        <span className='min-w-0 flex-1'>
          <PrivateTitle
            kind='task'
            record={row.task}
            className='text-[15px] leading-[21px]'
          >
            {row.title}
          </PrivateTitle>
          <span className='text-muted-foreground block text-[13px]'>
            <AimLength row={row} onFix={onFixLength} />
          </span>
        </span>
      </div>
      {choiceControl(row)}
      {row.choice !== null && (
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          className='text-muted-foreground relative -ml-2 gap-1 after:absolute after:-inset-y-1.5'
          onClick={() => setReasonRow(row)}
        >
          {row.reason
            ? HELM_COPY.windDownReasonChosen(
                HELM_COPY.dayAimsStruggle[row.reason],
              )
            : HELM_COPY.windDownWhy}
          <ChevronRight className='size-3.5' aria-hidden='true' />
        </Button>
      )}
    </li>
  );

  return (
    <section
      className={join('space-y-4', !isReview && 'helm-card p-4')}
      aria-label={HELM_COPY.windDownTitle}
    >
      {!isReview && (
        <h2 className='helm-serif text-[20px] leading-6'>
          {HELM_COPY.windDownTitle}
        </h2>
      )}
      {done.length > 0 && (
        <div className='space-y-1'>
          <SectionDivider label={HELM_COPY.windDownDone(done.length)} />
          <ul className='divide-border divide-y'>
            {done.map((row) => (
              <li key={row.taskId} className='flex items-start gap-3 py-3'>
                <span className='mt-0.5'>
                  <AimTick
                    title={row.title}
                    isDone
                    onTick={() => onTick(row.task)}
                    onUndoTick={() => onUndoTick(row.taskId)}
                  />
                </span>
                <PrivateTitle
                  kind='task'
                  record={row.task}
                  className='text-muted-foreground min-w-0 flex-1 text-[15px] leading-[21px] line-through'
                >
                  {row.title}
                </PrivateTitle>
              </li>
            ))}
          </ul>
        </div>
      )}
      {tonight.length > 0 && (
        <div className='space-y-1'>
          <SectionDivider label={HELM_COPY.windDownTonight(tonight.length)} />
          <ul className='divide-border divide-y'>
            {tonight.map(isReview ? renderReviewed : renderOpen)}
          </ul>
        </div>
      )}
      {wont.length > 0 && (
        <div className='space-y-1'>
          <SectionDivider label={HELM_COPY.windDownWont(wont.length)} />
          <ul className='divide-border divide-y'>
            {wont.map(isReview ? renderReviewed : renderOpen)}
          </ul>
        </div>
      )}
      {rows.length === 0 && (
        <p className='text-muted-foreground text-[15px]'>
          {HELM_COPY.windDownEmpty}
        </p>
      )}
      {!isReview && (
        <Button type='button' className='w-full' onClick={onFinish}>
          {HELM_COPY.windDownFinish}
        </Button>
      )}
      {changeRow && (
        <FormSheet
          isOpen
          onClose={() => setChangeRow(null)}
          title={HELM_COPY.windDownChange(changeRow.title)}
        >
          {rows
            .filter((row) => row.taskId === changeRow.taskId)
            .map((row) => (
              <div key={row.taskId} className='space-y-4 pb-2'>
                {choiceControl(row)}
                <PillGroup
                  label={HELM_COPY.windDownWhy}
                  options={REASONS}
                  value={row.reason}
                  isThin
                  isSearchable={false}
                  onChange={(reason) =>
                    onReason(row, reason === row.reason ? null : reason)
                  }
                />
              </div>
            ))}
        </FormSheet>
      )}
      {reasonRow && (
        <FormSheet
          isOpen
          onClose={() => setReasonRow(null)}
          title={HELM_COPY.windDownWhy}
        >
          <div className='space-y-4 pb-2'>
            <p className='text-muted-foreground text-[15px] text-pretty'>
              {reasonRow.title}
            </p>
            <PillGroup
              label={HELM_COPY.windDownWhy}
              options={REASONS}
              value={reasonRow.reason}
              isSearchable={false}
              onChange={(reason) => {
                onReason(
                  reasonRow,
                  reason === reasonRow.reason ? null : reason,
                );
                setReasonRow(null);
              }}
            />
          </div>
        </FormSheet>
      )}
    </section>
  );
}

export default WindDownCard;
