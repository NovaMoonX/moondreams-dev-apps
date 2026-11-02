import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Camera } from 'lucide-react';

import DetailSheet from '@/components/DetailSheet';
import PhotoStrip from '@/components/PhotoStrip';
import InlineNotice from '@/components/InlineNotice';
import { formatCentsShort } from '@/utils/moneyUtils';
import InterestView from '@apps/going-once/components/public/InterestView';
import PriceTag from '@apps/going-once/components/things/PriceTag';
import StatusDot from '@apps/going-once/components/things/StatusDot';
import { CONDITION_LABELS } from '@apps/going-once/constants';
import { usePublicPhotoUrls } from '@apps/going-once/queries/publicPhotoQueries';
import type { PublicThing } from '@apps/going-once/types';

interface BuyerThingDrawerProps {
  thing: PublicThing;
  linkId: string;
  onClose: () => void;
}

/** A thing's public details in a drawer (a modal from `sm`): only the fields the page is allowed to carry. */
function BuyerThingDrawer({ thing, linkId, onClose }: BuyerThingDrawerProps) {
  const [isAsking, setIsAsking] = useState(false);
  const [footerNode, setFooterNode] = useState<HTMLElement | null>(null);
  const [refusal, setRefusal] = useState<'not_found' | 'not_available' | null>(
    null,
  );
  const photos = usePublicPhotoUrls(thing.photos, 'm');
  const facts = [
    thing.condition === null ? null : CONDITION_LABELS[thing.condition],
    thing.brandModel,
    thing.size,
  ].filter((fact) => fact !== null);

  return (
    <DetailSheet
      isOpen
      onClose={onClose}
      title={thing.title}
      viewKey={isAsking ? 'interest' : 'thing'}
      footer={
        isAsking ? (
          <div ref={setFooterNode} />
        ) : (
          <div className='space-y-3'>
            {refusal !== null && (
              <p className='text-muted-foreground text-center text-sm'>
                {refusal === 'not_available'
                  ? 'This one just sold, sorry.'
                  : 'Want it? Ask whoever sent you this link.'}
              </p>
            )}
            <div className='flex items-center gap-2'>
              <Button
                type='button'
                variant='secondary'
                size='lg'
                rounded='full'
                className={refusal === null ? '' : 'w-full'}
                onClick={onClose}
              >
                Done
              </Button>
              {refusal === null && (
                <Button
                  type='button'
                  size='lg'
                  rounded='full'
                  className='min-w-0 flex-1'
                  onClick={() => setIsAsking(true)}
                >
                  I&apos;m interested
                </Button>
              )}
            </div>
          </div>
        )
      }
    >
      {isAsking && (
        <InterestView
          thing={thing}
          linkId={linkId}
          footerNode={footerNode}
          onBack={() => setIsAsking(false)}
          onDone={onClose}
          onRefused={setRefusal}
        />
      )}
      <div className={isAsking ? 'hidden' : 'space-y-4'}>
        <PhotoStrip
          photos={photos}
          label={thing.title}
          fallback={
            <div className='bg-accent/60 text-accent-foreground grid aspect-4/3 w-full place-items-center rounded-2xl'>
              <Camera className='size-8 opacity-60' aria-hidden='true' />
            </div>
          }
        />
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
