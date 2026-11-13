import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Camera } from 'lucide-react';

import PhotoMosaic from '@/components/PhotoMosaic';
import { formatCentsShort } from '@/utils/moneyUtils';
import PriceTag from '@apps/going-once/components/things/PriceTag';
import StatusDot from '@apps/going-once/components/things/StatusDot';
import { usePublicPhotoUrls } from '@apps/going-once/queries/publicPhotoQueries';
import type { PublicBundle, PublicThing } from '@apps/going-once/types';

interface BuyerBundleCardProps {
  bundle: PublicBundle;
  /** The bundle's things on offer; the cover puts the priciest first. */
  things: PublicThing[];
  onOpen: () => void;
}

const COVER_PHOTOS = 4;

/** A bundle on the public page, the size of a thing's card: a cover of up to four of its things' photos, priciest first, its name, the bundle price with what the things cost apart and what taking them all saves, and a Pending sticker while held. */
function BuyerBundleCard({ bundle, things, onOpen }: BuyerBundleCardProps) {
  const covers = usePublicPhotoUrls(
    [...things]
      .sort((a, b) => b.askingPriceCents - a.askingPriceCents)
      .flatMap((thing) => thing.photos.slice(0, 1))
      .slice(0, COVER_PHOTOS),
    's',
  )
    .filter((photo) => !photo.isMissing)
    .map((photo) => photo.url);
  const savedCents = bundle.separateCents - bundle.priceCents;
  const placeholder = (
    <Camera className='size-7 opacity-60' aria-hidden='true' />
  );

  return (
    <Button
      type='button'
      variant='tertiary'
      className='border-border bg-card h-full w-full flex-col items-stretch justify-start gap-0! overflow-hidden rounded-2xl! border p-0! text-left'
      onClick={onOpen}
    >
      <span className='bg-accent/60 text-accent-foreground relative block aspect-[4/3] w-full overflow-hidden'>
        <PhotoMosaic urls={covers} placeholder={placeholder} />
      </span>
      <span className='flex min-w-0 flex-1 flex-col gap-1.5 p-3'>
        <span className='text-foreground line-clamp-2 text-base leading-snug font-medium break-words'>
          {bundle.name}
        </span>
        <span className='mt-auto flex flex-wrap items-center gap-x-2 gap-y-1'>
          <PriceTag askingPriceCents={bundle.priceCents} />
          {savedCents > 0 && (
            <span className='text-muted-foreground text-xs line-through'>
              {formatCentsShort(bundle.separateCents)}
            </span>
          )}
          {bundle.status === 'PENDING' && (
            <StatusDot status='PENDING' className='text-muted-foreground' />
          )}
        </span>
        <span className='text-muted-foreground text-xs'>
          {savedCents > 0 && `Save ${formatCentsShort(savedCents)} · `}
          {bundle.thingIds.length} things
        </span>
      </span>
    </Button>
  );
}

export default BuyerBundleCard;
