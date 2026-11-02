import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Camera } from 'lucide-react';

import PriceTag from '@apps/going-once/components/things/PriceTag';
import StatusDot from '@apps/going-once/components/things/StatusDot';
import type { PublicThing } from '@apps/going-once/types';

interface BuyerCardProps {
  thing: PublicThing;
  onOpen: () => void;
}

/** A thing on the public page: a photo block (a placeholder until its photos arrive), its name, its asking price and, while held, a Pending sticker. */
function BuyerCard({ thing, onOpen }: BuyerCardProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      className='border-border bg-card h-full w-full flex-col items-stretch justify-start gap-0! overflow-hidden rounded-2xl! border p-0! text-left'
      onClick={onOpen}
    >
      <span className='bg-accent/60 text-accent-foreground grid aspect-[4/3] w-full place-items-center'>
        <Camera className='size-7 opacity-60' aria-hidden='true' />
      </span>
      <span className='flex min-w-0 flex-1 flex-col gap-1.5 p-3'>
        <span className='text-foreground line-clamp-2 text-base leading-snug font-medium break-words'>
          {thing.title}
        </span>
        <span className='mt-auto flex flex-wrap items-center gap-x-2 gap-y-1'>
          <PriceTag askingPriceCents={thing.askingPriceCents} />
          {thing.status === 'PENDING' && (
            <StatusDot status='PENDING' className='text-muted-foreground' />
          )}
        </span>
      </span>
    </Button>
  );
}

export default BuyerCard;
