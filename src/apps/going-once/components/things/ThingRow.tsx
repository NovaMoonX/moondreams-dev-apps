import { Button } from '@moondreamsdev/dreamer-ui/components';

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
function ThingRow({ item, uploadingCount, onOpen }: ThingRowProps) {
  const isSaleFinished = useAppSelector((state) =>
    selectIsSaleFinished(state, item.saleId),
  );
  const { label, facts } = getLine(item, uploadingCount, isSaleFinished);

  return (
    <Button
      type='button'
      variant='tertiary'
      className='border-border bg-card h-auto min-h-16 w-full items-start justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left'
      onClick={onOpen}
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
}

export default ThingRow;
