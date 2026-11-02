import { Button } from '@moondreamsdev/dreamer-ui/components';

import DetailSheet from '@/components/DetailSheet';
import FactsLine from '@/components/FactsLine';
import PhotoStrip from '@/components/PhotoStrip';
import PriceTag from '@apps/going-once/components/things/PriceTag';
import { CONDITION_LABELS } from '@apps/going-once/constants';
import { useItemPhotoUrls } from '@apps/going-once/queries/photoUrlQueries';
import type { Item } from '@apps/going-once/types';
import {
  formatAskingPrice,
  getItemName,
  isListable,
} from '@apps/going-once/utils/listing';
import { formatCentsShort } from '@/utils/moneyUtils';

interface ThingDrawerProps {
  item: Item;
  onClose: () => void;
  /** Reopens the add-a-thing walk-through on this thing. */
  onFinish: () => void;
}

/** A thing in full: its photos, a facts line and the private figures sellers negotiate with. */
function ThingDrawer({ item, onClose, onFinish }: ThingDrawerProps) {
  const name = getItemName(item);
  const photos = useItemPhotoUrls(item.photos).flatMap((photo) =>
    photo.url === null ? [] : [{ id: photo.id, url: photo.url }],
  );
  const asking = formatAskingPrice(item.askingPriceCents);
  const facts = [
    item.condition === null
      ? null
      : { key: 'condition', content: CONDITION_LABELS[item.condition] },
    isListable(item) ? null : { key: 'unlisted', content: 'Not listed yet' },
  ].filter((fact) => fact !== null);

  return (
    <DetailSheet
      isOpen
      onClose={onClose}
      title={name}
      footer={
        isListable(item) ? undefined : (
          <div className='flex items-center gap-2'>
            <Button
              type='button'
              size='lg'
              rounded='full'
              className='flex-1'
              onClick={onFinish}
            >
              Finish adding
            </Button>
          </div>
        )
      }
    >
      <div className='space-y-4'>
        <PhotoStrip photos={photos} label={name} />
        <div className='flex items-center gap-3'>
          {item.askingPriceCents !== null && (
            <PriceTag askingPriceCents={item.askingPriceCents} />
          )}
          <FactsLine
            className='text-muted-foreground min-w-0 text-sm'
            facts={facts}
          />
        </div>
        {!isListable(item) && (
          <p className='text-muted-foreground text-sm'>
            Buyers can&apos;t see this yet. It needs a photo, a name and a
            price.
          </p>
        )}
        <section className='bg-accent/60 border-border space-y-2 rounded-2xl border p-3'>
          <h3 className='text-accent-foreground text-sm font-semibold'>
            🔒 Only you and your co-sellers
          </h3>
          <dl className='grid grid-cols-2 gap-3 text-sm'>
            <div>
              <dt className='text-muted-foreground text-xs'>Asking price</dt>
              <dd className='font-medium'>{asking ?? 'No price yet'}</dd>
            </div>
            <div>
              <dt className='text-muted-foreground text-xs'>Floor price</dt>
              <dd className='font-medium'>
                {item.floorPriceCents === null
                  ? 'None set'
                  : formatCentsShort(item.floorPriceCents)}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </DetailSheet>
  );
}

export default ThingDrawer;
