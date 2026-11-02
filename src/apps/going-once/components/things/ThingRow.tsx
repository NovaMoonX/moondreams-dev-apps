import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Camera } from 'lucide-react';

import FallbackImage from '@/components/FallbackImage';
import { formatCentsShort } from '@/utils/moneyUtils';
import PriceTag from '@apps/going-once/components/things/PriceTag';
import StatusDot from '@apps/going-once/components/things/StatusDot';
import { CONDITION_LABELS } from '@apps/going-once/constants';
import { useItemPhotoUrls } from '@apps/going-once/queries/photoUrlQueries';
import type { Item } from '@apps/going-once/types';
import { getItemName, isListable } from '@apps/going-once/utils/listing';
import { getStatusRowLine } from '@apps/going-once/utils/status';

interface ThingRowProps {
  item: Item;
  /** Photos of this thing being saved right now. */
  uploadingCount: number;
  onOpen: () => void;
}

const getLine = (item: Item, uploadingCount: number) => {
  if (uploadingCount > 0)
    return `Uploading ${uploadingCount} ${uploadingCount === 1 ? 'photo' : 'photos'}`;
  if (item.status !== 'AVAILABLE') return getStatusRowLine(item);
  return [
    item.condition === null ? null : CONDITION_LABELS[item.condition],
    item.floorPriceCents === null
      ? null
      : `🔒 floor ${formatCentsShort(item.floorPriceCents)}`,
    isListable(item) ? null : 'Not listed yet',
  ]
    .filter((part) => part !== null)
    .join(' · ');
};

/** A thing in the list: its cover, name, a muted line and its asking price. */
function ThingRow({ item, uploadingCount, onOpen }: ThingRowProps) {
  const [cover] = useItemPhotoUrls(item.photos.slice(0, 1));
  const line = getLine(item, uploadingCount);
  const tagCents =
    item.status === 'SOLD' && item.sale !== null
      ? item.sale.priceCents
      : item.askingPriceCents;

  return (
    <Button
      type='button'
      variant='tertiary'
      className='border-border bg-card h-auto min-h-16 w-full items-start justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left'
      onClick={onOpen}
    >
      <span className='bg-muted text-muted-foreground grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg'>
        {cover?.url ? (
          <FallbackImage
            src={cover.url}
            alt=''
            className='size-full object-cover'
            fallback={<Camera className='size-5' aria-hidden='true' />}
          />
        ) : (
          <Camera className='size-5' aria-hidden='true' />
        )}
      </span>
      <span className='min-w-0 flex-1'>
        <span className='text-foreground line-clamp-2 text-base font-medium break-words'>
          {getItemName(item)}
        </span>
        <span className='text-muted-foreground mt-0.5 flex items-baseline gap-1.5 text-sm font-normal'>
          <StatusDot status={item.status} isWordHidden />
          {line !== '' && <span className='min-w-0 break-words'>{line}</span>}
        </span>
      </span>
      {tagCents !== null && item.status !== 'WITHDRAWN' && (
        <PriceTag askingPriceCents={tagCents} />
      )}
    </Button>
  );
}

export default ThingRow;
