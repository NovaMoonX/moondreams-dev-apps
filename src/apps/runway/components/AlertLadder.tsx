import { ChevronRight } from 'lucide-react';
import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { formatTimeAgo } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { ALERT_WORDS } from '@apps/runway/constants';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import type { AlertStateDoc, Cents } from '@apps/runway/types';
import {
  getAlertTitle,
  isPassed,
  type AlertEntry,
} from '@apps/runway/utils/alertText';

/** How far apart two notches sit at most, in pixels, when the rail is drawn to scale; the least is a small gap, and hidden amounts use it everywhere. */
const MAX_GAP_PX = 96;
const MIN_GAP_PX = 8;

interface AlertLadderProps {
  /** Highest line first, as `toAlertEntries` gives them. */
  entries: readonly AlertEntry[];
  /** Where the watched figure stands today; null when it isn't known. */
  figureCents: Cents | null;
  /** The rail's top: what an envelope gets each time, or the highest of its lines and its figure. */
  topCents: Cents;
  states: ReadonlyMap<string, AlertStateDoc>;
  isHidden: boolean;
  /** The plan holds the most alerts it can, so none is offered. */
  isFull: boolean;
  now: number;
  onOpen: (alertId: string) => void;
  onAdd: () => void;
}

type Step =
  { kind: 'alert'; entry: AlertEntry; at: Cents } | { kind: 'now'; at: Cents };

/** One set of alerts as a vertical rail, the highest line at the top so reading down follows the money as it is spent. Alerts the figure has reached are filled; those still ahead are hollow. */
function AlertLadder({
  entries,
  figureCents,
  topCents,
  states,
  isHidden,
  isFull,
  now,
  onOpen,
  onAdd,
}: AlertLadderProps) {
  const mask = useMaskedText();
  const alertSteps = entries.map((entry): Step => ({
    kind: 'alert',
    entry,
    at: entry.lineCents ?? 0,
  }));
  const isAbove = (step: Step) =>
    step.kind === 'alert' && isPassed(step.entry.lineCents, figureCents);
  const hasNow = !isHidden && figureCents !== null;
  const steps: Step[] = hasNow
    ? [
        ...alertSteps.filter(isAbove),
        { kind: 'now', at: figureCents },
        ...alertSteps.filter((step) => !isAbove(step)),
      ]
    : alertSteps;

  const gapBefore = (index: number) => {
    if (index === 0) return 0;
    if (isHidden) return MIN_GAP_PX;
    const gap = Math.max(0, steps[index - 1].at - steps[index].at);
    return Math.min(
      MAX_GAP_PX,
      MIN_GAP_PX + Math.round((gap / Math.max(topCents, 1)) * MAX_GAP_PX),
    );
  };

  return (
    <div className='space-y-3'>
      {steps.length === 0 ? (
        <p className='text-muted-foreground text-sm'>{ALERT_WORDS.empty}</p>
      ) : (
        <ol className='relative'>
          <span
            aria-hidden='true'
            className='bg-border absolute top-4 bottom-4 left-[9px] w-0.5'
          />
          {steps.map((step, index) => {
            if (step.kind === 'now') {
              return (
                <li
                  key='now'
                  style={{ marginTop: gapBefore(index) }}
                  className='text-primary relative flex min-h-8 items-center gap-2 pl-9 text-xs font-semibold'
                >
                  <span
                    aria-hidden='true'
                    className='bg-primary ring-accent absolute top-1/2 left-1 size-3 -translate-y-1/2 rounded-full ring-4'
                  />
                  <span>{ALERT_WORDS.now}</span>
                  <span className='tabular-nums'>
                    {mask(formatCents(step.at))}
                  </span>
                </li>
              );
            }
            const { alert, lineCents } = step.entry;
            const isFilled = hasNow && isPassed(lineCents, figureCents);
            const title = mask(getAlertTitle(alert.line, lineCents));
            const lastFiredAt = states.get(alert.id)?.lastFiredAt ?? null;
            const detail =
              lastFiredAt === null
                ? ALERT_WORDS.notYet
                : ALERT_WORDS.wentOff(formatTimeAgo(lastFiredAt, now, true));
            return (
              <li
                key={alert.id}
                style={{ marginTop: gapBefore(index) }}
                className='relative pl-9'
              >
                <span
                  aria-hidden='true'
                  className={join(
                    'border-primary absolute top-1/2 left-0 size-5 -translate-y-1/2 rounded-full border-2',
                    isFilled ? 'bg-primary' : 'bg-background',
                  )}
                />
                <Button
                  type='button'
                  variant='tertiary'
                  aria-label={`${title}. ${detail}`}
                  className='border-border bg-card h-auto min-h-14 w-full justify-start gap-2 rounded-xl border px-3 py-2 text-left font-normal'
                  onClick={() => onOpen(alert.id)}
                >
                  <span className='block min-w-0 flex-1'>
                    <span className='block text-[15px] font-medium break-words'>
                      {title}
                    </span>
                    <span className='text-muted-foreground block text-[13px]'>
                      {detail}
                    </span>
                  </span>
                  <ChevronRight
                    className='text-muted-foreground size-4 shrink-0'
                    aria-hidden='true'
                  />
                </Button>
              </li>
            );
          })}
        </ol>
      )}
      {isFull ? (
        <p className='text-muted-foreground text-sm'>{ALERT_WORDS.limit}</p>
      ) : (
        <Button
          type='button'
          variant='secondary'
          className='min-h-10 w-full'
          onClick={onAdd}
        >
          {ALERT_WORDS.add}
        </Button>
      )}
    </div>
  );
}

export default AlertLadder;
