import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Ellipsis, Trash2 } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import DetailSheet from '@/components/DetailSheet';
import FactsLine from '@/components/FactsLine';
import LinkPreviewCard from '@/components/LinkPreviewCard';
import PhotoStrip from '@/components/PhotoStrip';
import { useNow } from '@/hooks/useNow';
import { formatDateUTC } from '@/utils/formatUtils';
import { formatCentsShort } from '@/utils/moneyUtils';
import { parseHttpUrl } from '@/utils/urlUtils';
import PriceTag from '@apps/going-once/components/things/PriceTag';
import { CONDITION_LABELS } from '@apps/going-once/constants';
import { useDeleteThing } from '@apps/going-once/hooks/useDeleteThing';
import { useItemPhotoUrls } from '@apps/going-once/queries/photoUrlQueries';
import type { Item } from '@apps/going-once/types';
import {
  canDeleteItem,
  formatAddedAgo,
  formatAskingPrice,
  getItemName,
  isListable,
} from '@apps/going-once/utils/listing';

interface ThingDrawerProps {
  item: Item;
  uid: string;
  isSeller: boolean;
  onClose: () => void;
  /** Reopens the add-a-thing walk-through on this thing. */
  onFinish: () => void;
  onModify: () => void;
}

interface Row {
  label: string;
  value: string;
}

/** The store's page as a card that opens it; nothing for a link that isn't a web address. */
function StoreLink({ item }: { item: Item }) {
  const page = item.boughtUrl === null ? null : parseHttpUrl(item.boughtUrl);
  if (item.boughtUrl === null || page === null) return null;
  const { boughtUrlPreview: preview } = item;
  return (
    <a
      href={item.boughtUrl}
      target='_blank'
      rel='noopener noreferrer'
      className='block'
    >
      <LinkPreviewCard
        preview={{
          url: item.boughtUrl,
          host: page.hostname.replace(/^www\./i, ''),
          title: preview?.title ?? null,
          siteName: preview?.siteName ?? null,
          description: preview?.description ?? null,
          imageUrl: preview?.imageUrl?.startsWith('https://')
            ? preview.imageUrl
            : null,
        }}
      />
    </a>
  );
}

const getPrivateRows = (item: Item): Row[] => {
  const asking = formatAskingPrice(item.askingPriceCents);
  const bought = [
    item.boughtFrom,
    item.boughtOn === null ? null : formatDateUTC(item.boughtOn),
  ]
    .filter((part) => part !== null)
    .join(' · ');
  return [
    { label: 'Asking price', value: asking ?? 'No price yet' },
    {
      label: 'Floor price',
      value:
        item.floorPriceCents === null
          ? 'None set'
          : formatCentsShort(item.floorPriceCents),
    },
    ...(item.originalPriceCents === null
      ? []
      : [
          {
            label: 'Original price',
            value: formatCentsShort(item.originalPriceCents),
          },
        ]),
    ...(bought === '' ? [] : [{ label: 'Where you got it', value: bought }]),
  ];
};

/** A thing in full: its photos, a facts line and the private figures sellers negotiate with. */
function ThingDrawer({
  item,
  uid,
  isSeller,
  onClose,
  onFinish,
  onModify,
}: ThingDrawerProps) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const now = useNow();
  const deleteThing = useDeleteThing(item.saleId);
  const name = getItemName(item);
  const photos = useItemPhotoUrls(item.photos).flatMap((photo) =>
    photo.url === null ? [] : [{ id: photo.id, url: photo.url }],
  );
  const facts = [
    item.condition === null
      ? null
      : { key: 'condition', content: CONDITION_LABELS[item.condition] },
    isListable(item) ? null : { key: 'unlisted', content: 'Not listed yet' },
  ].filter((fact) => fact !== null);
  const buyerFacts = [
    item.brandModel === null
      ? null
      : { key: 'brand', content: item.brandModel },
    item.size === null ? null : { key: 'size', content: item.size },
    item.showOriginalPrice && item.originalPriceCents !== null
      ? {
          key: 'original',
          content: `Originally ${formatCentsShort(item.originalPriceCents)}`,
        }
      : null,
  ].filter((fact) => fact !== null);
  const canDelete = canDeleteItem(item, { isSeller, uid, now });
  const isFinishShown = !isListable(item);
  const showMore = isMoreOpen && canDelete;

  const footer = (
    <div className='flex items-center gap-2'>
      <Button
        type='button'
        variant='secondary'
        size='lg'
        rounded='full'
        className={join(!isFinishShown && 'flex-1')}
        onClick={onModify}
      >
        Modify
      </Button>
      {canDelete && (
        <Button
          type='button'
          variant='secondary'
          size='icon'
          rounded='full'
          aria-label='More for this thing'
          aria-expanded={showMore}
          onClick={() => setIsMoreOpen((open) => !open)}
          className={join(
            'text-foreground! size-10 min-w-10 shrink-0 p-0',
            showMore && 'bg-accent!',
          )}
        >
          <Ellipsis className='size-5' aria-hidden='true' />
        </Button>
      )}
      {isFinishShown && (
        <Button
          type='button'
          size='lg'
          rounded='full'
          className='flex-1'
          onClick={onFinish}
        >
          Finish adding
        </Button>
      )}
    </div>
  );

  return (
    <DetailSheet
      isOpen
      onClose={onClose}
      title={name}
      viewKey={showMore ? 'more' : 'thing'}
      footer={footer}
    >
      {showMore && (
        <div className='space-y-5'>
          <BackLink onBack={() => setIsMoreOpen(false)} label={name} />
          <ActionGroup isRoomy>
            <ActionRow
              isGrouped
              isRoomy
              isDestructive
              icon={<Trash2 />}
              label='Delete thing'
              subtitle={
                isSeller ? undefined : formatAddedAgo(item.createdAt, now)
              }
              onClick={() => {
                void deleteThing(item).then((isDeleted) => {
                  if (isDeleted) onClose();
                });
              }}
            />
          </ActionGroup>
        </div>
      )}
      <div className={join('space-y-4', showMore && 'hidden')}>
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
        {item.description !== null && (
          <p className='text-sm break-words whitespace-pre-line'>
            {item.description}
          </p>
        )}
        <FactsLine
          className='text-muted-foreground min-w-0 text-sm'
          facts={buyerFacts}
        />
        {!isListable(item) && (
          <p className='text-muted-foreground text-sm'>
            Buyers can&apos;t see this yet. It needs a photo, a name and a
            price.
          </p>
        )}
        <section className='bg-accent/60 border-border space-y-3 rounded-2xl border p-3'>
          <h3 className='text-accent-foreground text-sm font-semibold'>
            🔒 Only you and your co-sellers
          </h3>
          <dl className='grid grid-cols-2 gap-3 text-sm'>
            {getPrivateRows(item).map((row) => (
              <div key={row.label} className='min-w-0'>
                <dt className='text-muted-foreground text-xs'>{row.label}</dt>
                <dd className='font-medium break-words'>{row.value}</dd>
              </div>
            ))}
          </dl>
          <StoreLink item={item} />
          {item.notes !== null && (
            <div className='text-sm'>
              <p className='text-muted-foreground text-xs'>Notes</p>
              <p className='break-words whitespace-pre-line'>{item.notes}</p>
            </div>
          )}
        </section>
      </div>
    </DetailSheet>
  );
}

export default ThingDrawer;
