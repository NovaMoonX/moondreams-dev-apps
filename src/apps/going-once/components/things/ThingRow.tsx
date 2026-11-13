import { Button, Checkbox } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useLongPress } from '@/hooks/useLongPress';
import { useAppSelector } from '@/store';
import PriceTag from '@apps/going-once/components/things/PriceTag';
import ThingThumb from '@apps/going-once/components/things/ThingThumb';
import StatusDot from '@apps/going-once/components/things/StatusDot';
import { CONDITION_LABELS, NOT_LISTED_LABEL } from '@apps/going-once/constants';
import { selectIsSaleFinished } from '@apps/going-once/store/selectors';
import type { Item } from '@apps/going-once/types';
import {
  getAvailableLabel,
  getDraftHint,
  getItemName,
} from '@apps/going-once/utils/listing';
import { getStatusFacts } from '@apps/going-once/utils/status';

interface ThingRowProps {
  item: Item;
  /** Photos of this thing being saved right now. */
  uploadingCount: number;
  onOpen: () => void;
  /** The bundle it is in, named after its status. */
  bundleName?: string | null;
  /** Press and hold (right-click on a computer) starts picking things for a bundle. */
  onLongPress?: () => void;
  /** While picking: whether this thing can go in a bundle, and whether it is ticked. */
  pick?: { isPickable: boolean; isChecked: boolean; onToggle: () => void };
}

/** The row's muted line after its status dot: the word (when the status doesn't say it) and what follows. */
const getLine = (
  item: Item,
  uploadingCount: number,
  isSaleFinished: boolean,
) => {
  if (uploadingCount > 0)
    return {
      label: `Uploading ${uploadingCount} ${uploadingCount === 1 ? 'photo' : 'photos'}`,
      facts: '',
    };
  if (item.status !== 'AVAILABLE')
    return { label: undefined, facts: getStatusFacts(item, true) };
  const label = getAvailableLabel(item, isSaleFinished);
  if (label === NOT_LISTED_LABEL)
    return { label, facts: `· ${getDraftHint(item)}` };
  const facts =
    item.condition === null ? '' : `· ${CONDITION_LABELS[item.condition]}`;
  return { label, facts };
};

/** A thing in the list: its cover, name, its status as a dot and word with what follows, and its asking price. */
function ThingRow({
  item,
  uploadingCount,
  onOpen,
  bundleName = null,
  onLongPress,
  pick,
}: ThingRowProps) {
  const longPress = useLongPress(() => onLongPress?.());
  // Picking starts on a hold and the row stops offering it, so the handlers stay on to swallow the release tap.
  const isHoldable = onLongPress !== undefined || pick !== undefined;
  const isSaleFinished = useAppSelector((state) =>
    selectIsSaleFinished(state, item.saleId),
  );
  const line = getLine(item, uploadingCount, isSaleFinished);
  const { label } = line;
  const facts =
    bundleName === null
      ? line.facts
      : `${line.facts === '' ? '·' : `${line.facts} ·`} In ${bundleName}`;

  const row = (
    <Button
      type='button'
      variant='tertiary'
      className={join(
        'border-border bg-card h-auto min-h-16 w-full items-start justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left',
        isHoldable && 'select-none [-webkit-touch-callout:none]',
        pick && !pick.isPickable && '[&>*]:opacity-60',
      )}
      {...(isHoldable ? longPress : {})}
      onClick={(event) => {
        if (isHoldable) longPress.onClick(event);
        if (event.defaultPrevented) return;
        if (pick) {
          if (pick.isPickable) pick.onToggle();
          return;
        }
        onOpen();
      }}
    >
      <ThingThumb item={item} />
      <span className='min-w-0 flex-1'>
        <span className='text-foreground line-clamp-2 text-base font-medium break-words'>
          {getItemName(item)}
        </span>
        <span className='text-muted-foreground mt-0.5 line-clamp-2 text-sm font-normal break-words'>
          <StatusDot status={item.status} label={label} isInline>
            {facts}
          </StatusDot>
        </span>
      </span>
      {item.askingPriceCents !== null && (
        <PriceTag askingPriceCents={item.askingPriceCents} />
      )}
    </Button>
  );

  return (
    <div className='flex items-center gap-2'>
      {pick && (
        <span className='flex size-6 shrink-0 items-center justify-center'>
          {pick.isPickable && (
            <Checkbox
              checked={pick.isChecked}
              onCheckedChange={pick.onToggle}
              aria-label={`Pick ${getItemName(item)}`}
            />
          )}
        </span>
      )}
      <div className='min-w-0 flex-1'>{row}</div>
    </div>
  );
}

export default ThingRow;
