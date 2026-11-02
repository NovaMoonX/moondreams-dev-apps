import { Camera } from 'lucide-react';

import DetailSheet from '@/components/DetailSheet';
import InlineNotice from '@/components/InlineNotice';
import { formatCentsShort } from '@/utils/moneyUtils';
import PriceTag from '@apps/going-once/components/things/PriceTag';
import StatusDot from '@apps/going-once/components/things/StatusDot';
import { CONDITION_LABELS } from '@apps/going-once/constants';
import type { PublicThing } from '@apps/going-once/types';

interface BuyerThingDrawerProps {
  thing: PublicThing;
  onClose: () => void;
}

/** A thing's public details in a drawer (a modal from `sm`): only the fields the page is allowed to carry. */
function BuyerThingDrawer({ thing, onClose }: BuyerThingDrawerProps) {
  const facts = [
    thing.condition === null ? null : CONDITION_LABELS[thing.condition],
    thing.brandModel,
    thing.size,
  ].filter((fact) => fact !== null);

  return (
    <DetailSheet isOpen onClose={onClose} title={thing.title}>
      <div className='space-y-4'>
        <div className='bg-accent/60 text-accent-foreground grid h-48 w-full place-items-center rounded-2xl'>
          <Camera className='size-8 opacity-60' aria-hidden='true' />
        </div>
        <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
          <PriceTag askingPriceCents={thing.askingPriceCents} />
          {thing.originalPriceCents !== null && (
            <span className='text-muted-foreground text-sm'>
              Was{' '}
              <span className='line-through'>
                {formatCentsShort(thing.originalPriceCents)}
              </span>
            </span>
          )}
          {thing.status === 'PENDING' && <StatusDot status='PENDING' />}
        </div>
        {facts.length > 0 && (
          <p className='text-muted-foreground text-sm'>{facts.join(' · ')}</p>
        )}
        {thing.description !== null && (
          <p className='text-sm wrap-break-word whitespace-pre-wrap'>
            {thing.description}
          </p>
        )}
        {thing.status === 'PENDING' && (
          <InlineNotice tone='info'>
            Pending: someone&apos;s picking this up.
          </InlineNotice>
        )}
      </div>
    </DetailSheet>
  );
}

export default BuyerThingDrawer;
