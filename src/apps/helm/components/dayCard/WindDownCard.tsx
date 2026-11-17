import { Button } from '@moondreamsdev/dreamer-ui/components';

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
  const isDone = (row: AimRow) => row.isDone || heldIds.has(row.taskId);
  const done = rows.filter(isDone);
  const open = rows.filter((row) => !isDone(row));
  const tonight = open.filter((row) => row.result !== 'wontHappen');
  const wont = open.filter((row) => row.result === 'wontHappen');

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
      {row.choice !== null && (
        <div className='space-y-2'>
          <p className='text-muted-foreground text-[13px]'>
            {HELM_COPY.windDownWhy}
          </p>
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
          <ul className='divide-border divide-y'>{tonight.map(renderOpen)}</ul>
        </div>
      )}
      {wont.length > 0 && (
        <div className='space-y-1'>
          <SectionDivider label={HELM_COPY.windDownWont(wont.length)} />
          <ul className='divide-border divide-y'>{wont.map(renderOpen)}</ul>
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
    </section>
  );
}

export default WindDownCard;
