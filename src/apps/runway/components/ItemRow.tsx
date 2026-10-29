import type { ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Lock,
  TriangleAlert,
} from 'lucide-react';

import { Button, Checkbox } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import SensitiveValue from '@/components/SensitiveValue';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { MaskedText } from '@apps/runway/components/MaskedText';
import ItemBadge from '@apps/runway/components/ItemBadge';
import { PRIORITIES_WORDS, TICK_HIT_CLASS } from '@apps/runway/constants';

/** A row in the priorities list while it is being reordered: tapped to lift, nudged up or down, or fixed in place. */
export interface ItemRowReorder {
  /** Funded first or last by the engine whatever its rank, so it cannot be lifted. */
  isFixed: boolean;
  /** Why the row is fixed, heard and seen on hover; null falls back to the detail. */
  fixedNote: string | null;
  isLifted: boolean;
  onLift: () => void;
  onMoveUp: (() => void) | null;
  onMoveDown: (() => void) | null;
}

interface ItemRowProps {
  name: string;
  emoji?: string | null;
  /** Replaces the badge (a date chip on an income day). */
  leading?: ReactNode;
  /** The single most useful fact, on one muted line. */
  detail?: string | null;
  /** A detail that asks for a decision on this row reads in the normal colour. */
  isDetailStrong?: boolean;
  /** A one-line warning in the detail's place: warning ink, the icon in its own fixed column and the text cut at the line's end. */
  warningLine?: ReactNode;
  /** The detail says the plan falls short: warning ink and icon. */
  isDetailWarning?: boolean;
  figure?: string | null;
  /** A figure is masked while amounts are hidden; a row that shows what the person is typing turns it off. */
  isPrivate?: boolean;
  /** A word under the figure that says what it counts ("left", "over"). */
  figureWord?: string | null;
  /** Opens the row's sheet; a row without it has nothing behind it and no chevron. */
  onOpen?: () => void;
  ariaLabel?: string;
  /** What a screen reader hears while private amounts are hidden; defaults to the name alone. */
  hiddenAriaLabel?: string;
  /** A row ticked from a checklist: tapping the row ticks it and the chevron opens the sheet. */
  tick?: { checked: boolean; onChange: (checked: boolean) => void };
  /** Replaces the chevron and the sheet with the controls for placing the row. */
  reorder?: ItemRowReorder;
}

/** A row is a glance: the badge, the name, one muted line, the figure on the right and a chevron. */
function ItemRow({
  name,
  emoji = null,
  leading,
  detail,
  isDetailStrong = false,
  isDetailWarning = false,
  warningLine,
  figure,
  isPrivate = true,
  figureWord,
  onOpen,
  ariaLabel: givenAriaLabel,
  hiddenAriaLabel,
  tick,
  reorder,
}: ItemRowProps) {
  const { isHidden } = useValuesHidden();
  const ariaLabel =
    isPrivate && isHidden && givenAriaLabel
      ? (hiddenAriaLabel ?? `${name}. Amount hidden. Open`)
      : givenAriaLabel;
  const hide = (node: ReactNode, isOn: boolean) =>
    isOn ? <SensitiveValue>{node}</SensitiveValue> : node;
  const shownDetail =
    reorder?.isFixed && reorder.fixedNote ? reorder.fixedNote : detail;
  const hasDetail = Boolean(shownDetail) || Boolean(warningLine);
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
                {isPrivate && isHidden ? '\u00a0' : figureWord}
              </span>
            )}
          </span>
        )}
      </span>
      {warningLine && (
        <span className='flex items-center text-sm text-(--runway-warning-ink)'>
          <span className='flex w-5 shrink-0 justify-center'>
            <TriangleAlert className='h-3.5 w-3.5' aria-hidden='true' />
          </span>
          <span className='min-w-0 flex-1 truncate'>{warningLine}</span>
        </span>
      )}
      {hasDetail && !warningLine && (
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
            {isPrivate && shownDetail ? (
              <MaskedText>{shownDetail}</MaskedText>
            ) : (
              shownDetail
            )}
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

  const compactName = (
    <span className='block min-w-0 flex-1 text-sm font-medium break-words'>
      <span className='line-clamp-1'>{name}</span>
    </span>
  );

  if (reorder?.isFixed) {
    return (
      <li
        className='flex min-h-11 items-center gap-2 px-3'
        title={shownDetail ?? undefined}
      >
        {badge}
        {compactName}
        <Lock
          className='text-muted-foreground h-4 w-4 shrink-0'
          aria-hidden='true'
        />
        <span className='sr-only'>
          {PRIORITIES_WORDS.fixedHidden}
          {shownDetail ? `. ${shownDetail}` : ''}
        </span>
      </li>
    );
  }

  if (reorder) {
    const nudge = (
      label: string,
      icon: ReactNode,
      onClick: (() => void) | null,
    ) => (
      <Button
        type='button'
        variant='tertiary'
        size='stripped'
        className="text-muted-foreground! relative grid size-8 shrink-0 place-items-center before:absolute before:-inset-1 before:content-['']"
        aria-label={label}
        disabled={onClick === null}
        onClick={onClick ?? undefined}
      >
        {icon}
      </Button>
    );
    return (
      <li
        className={join(
          'flex items-center first:rounded-t-2xl last:rounded-b-2xl',
          reorder.isLifted && 'bg-accent',
        )}
      >
        <Button
          type='button'
          variant='tertiary'
          className='text-foreground! h-11 min-h-11 min-w-0 flex-1 items-center justify-start gap-2 rounded-none p-0! px-3! text-left font-normal whitespace-normal'
          aria-pressed={reorder.isLifted}
          aria-label={`${name}. ${reorder.isLifted ? 'Lifted, choose where to place it' : 'Tap to lift'}`}
          onClick={reorder.onLift}
        >
          {badge}
          {compactName}
        </Button>
        <span className='mr-2 flex shrink-0 items-center gap-2'>
          {nudge(
            `Move ${name} up`,
            <ArrowUp className='h-4 w-4' aria-hidden='true' />,
            reorder.onMoveUp,
          )}
          {nudge(
            `Move ${name} down`,
            <ArrowDown className='h-4 w-4' aria-hidden='true' />,
            reorder.onMoveDown,
          )}
        </span>
      </li>
    );
  }

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
