import type { ReactNode } from 'react';
import { ChevronRight, TriangleAlert } from 'lucide-react';

import { Button, Checkbox } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import SensitiveValue from '@/components/SensitiveValue';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import ItemBadge from '@apps/runway/components/ItemBadge';
import { TICK_HIT_CLASS } from '@apps/runway/constants';

const FIGURE_PATTERN = /([−+-]?\$[\d,]+(?:\.\d+)?)/;

/** A line with each amount in it blurred and the words left readable. */
const blurFigures = (text: string) =>
  text
    .split(FIGURE_PATTERN)
    .map((part, index) =>
      index % 2 === 1 ? (
        <SensitiveValue key={index}>{part}</SensitiveValue>
      ) : (
        part
      ),
    );

interface ItemRowProps {
  name: string;
  emoji?: string | null;
  /** Replaces the badge (a date chip on an income day). */
  leading?: ReactNode;
  /** The single most useful fact, on one muted line. */
  detail?: string | null;
  /** A detail that asks for a decision on this row reads in the normal colour. */
  isDetailStrong?: boolean;
  /** The detail says the plan falls short: warning ink and icon. */
  isDetailWarning?: boolean;
  figure?: string | null;
  /** The figure is private until shown (a tab's front): it blurs, and so does the detail when `isDetailPrivate`. */
  isPrivate?: boolean;
  /** The detail line gives an amount away ("$30 short"), so it blurs with the figure. */
  isDetailPrivate?: boolean;
  /** A word under the figure that says what it counts ("left", "over"). */
  figureWord?: string | null;
  /** Opens the row's sheet; a row without it has nothing behind it and no chevron. */
  onOpen?: () => void;
  ariaLabel?: string;
  /** What a screen reader hears while private amounts are hidden; defaults to the name alone. */
  hiddenAriaLabel?: string;
  /** A row ticked from a checklist: tapping the row ticks it and the chevron opens the sheet. */
  tick?: { checked: boolean; onChange: (checked: boolean) => void };
}

/** A row is a glance: the badge, the name, one muted line, the figure on the right and a chevron. */
function ItemRow({
  name,
  emoji = null,
  leading,
  detail,
  isDetailStrong = false,
  isDetailWarning = false,
  figure,
  isPrivate = false,
  isDetailPrivate = false,
  figureWord,
  onOpen,
  ariaLabel: givenAriaLabel,
  hiddenAriaLabel,
  tick,
}: ItemRowProps) {
  const { isHidden } = useValuesHidden();
  const ariaLabel =
    isPrivate && isHidden && givenAriaLabel
      ? (hiddenAriaLabel ?? `${name}. Amount hidden. Open`)
      : givenAriaLabel;
  const hide = (node: ReactNode, isOn: boolean) =>
    isOn ? <SensitiveValue>{node}</SensitiveValue> : node;
  const hasDetail = Boolean(detail);
  const badge = tick
    ? null
    : (leading ?? <ItemBadge name={name} emoji={emoji} />);
  const text = (
    <span className={join('block min-w-0 flex-1', !hasDetail && 'pt-2')}>
      <span className='flex items-start justify-between gap-3'>
        <span className='block min-w-0 font-medium break-words'>
          <span className='line-clamp-2'>{name}</span>
        </span>
        {figure && (
          <span className='block shrink-0 text-right'>
            <span className='block font-semibold whitespace-nowrap tabular-nums'>
              {hide(figure, isPrivate)}
            </span>
            {figureWord && (
              <span className='text-muted-foreground block text-xs'>
                {hide(figureWord, isPrivate)}
              </span>
            )}
          </span>
        )}
      </span>
      {hasDetail && (
        <span
          className={join(
            'block text-sm break-words',
            isDetailStrong ? 'text-foreground' : 'text-muted-foreground',
            isDetailWarning && 'flex items-start gap-1.5',
          )}
        >
          {isDetailWarning && (
            <TriangleAlert
              className='mt-0.5 h-3.5 w-3.5 shrink-0 text-(--runway-warning-ink)'
              aria-hidden='true'
            />
          )}
          <span className='line-clamp-2'>
            {isPrivate && isDetailPrivate && detail
              ? blurFigures(detail)
              : detail}
          </span>
        </span>
      )}
    </span>
  );
  const chevron = (
    <ChevronRight
      className={join(
        'text-muted-foreground h-4 w-4 shrink-0',
        hasDetail ? 'mt-0.5' : 'mt-3',
      )}
      aria-hidden='true'
    />
  );
  const rowClass =
    'text-foreground! h-auto min-h-16 w-full items-start justify-start gap-3 rounded-none p-3! text-left font-normal whitespace-normal';

  if (tick) {
    return (
      <li className='flex items-start'>
        <span className='flex h-16 shrink-0 items-center pl-3'>
          <Checkbox
            className={TICK_HIT_CLASS}
            checked={tick.checked}
            onCheckedChange={(next) => tick.onChange(Boolean(next))}
            aria-label={`${name} done`}
          />
        </span>
        <Button
          type='button'
          variant='tertiary'
          className={join(rowClass, 'min-w-0 flex-1')}
          aria-label={ariaLabel ? `${ariaLabel}. Tick it` : undefined}
          onClick={() => tick.onChange(!tick.checked)}
        >
          {text}
        </Button>
        {onOpen && (
          <Button
            type='button'
            variant='tertiary'
            size='stripped'
            className='text-muted-foreground! mt-3 mr-1 grid size-10 shrink-0 place-items-center'
            aria-label={`Open ${name}`}
            onClick={onOpen}
          >
            <ChevronRight className='h-4 w-4' aria-hidden='true' />
          </Button>
        )}
      </li>
    );
  }

  if (!onOpen) {
    return (
      <li
        className='flex min-h-16 items-start gap-3 p-3'
        aria-label={ariaLabel}
      >
        {badge}
        {text}
      </li>
    );
  }

  return (
    <li className='first:[&>button]:rounded-t-2xl last:[&>button]:rounded-b-2xl'>
      <Button
        type='button'
        variant='tertiary'
        className={rowClass}
        aria-label={ariaLabel}
        onClick={onOpen}
      >
        {badge}
        {text}
        {chevron}
      </Button>
    </li>
  );
}

export default ItemRow;
