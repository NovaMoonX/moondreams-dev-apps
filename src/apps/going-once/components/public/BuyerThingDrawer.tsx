import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Camera, ExternalLink } from 'lucide-react';

import CopyTextButton from '@/components/CopyTextButton';
import DetailSheet from '@/components/DetailSheet';
import PhotoStrip from '@/components/PhotoStrip';
import InlineNotice from '@/components/InlineNotice';
import { formatCentsShort } from '@/utils/moneyUtils';
import { getWebLinkHost } from '@/utils/urlUtils';
import InterestView from '@apps/going-once/components/public/InterestView';
import PriceTag from '@apps/going-once/components/things/PriceTag';
import StatusDot from '@apps/going-once/components/things/StatusDot';
import { CONDITION_LABELS } from '@apps/going-once/constants';
import { usePublicPhotoUrls } from '@apps/going-once/queries/publicPhotoQueries';
import type { PublicThing } from '@apps/going-once/types';
import { getThingPagePath } from '@apps/going-once/utils/listing';

interface BuyerThingDrawerProps {
  thing: PublicThing;
  linkId: string;
  /** How the sale says buyers can pay; shown on the interest form. */
  paymentMethods: string[];
  onClose: () => void;
}

/** A thing's public details in a drawer (a modal from `sm`): only the fields the page is allowed to carry. */
function BuyerThingDrawer({
  thing,
  linkId,
  paymentMethods,
  onClose,
}: BuyerThingDrawerProps) {
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
  const storeHost =
    thing.storeUrl === null ? null : getWebLinkHost(thing.storeUrl);

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
          paymentMethods={paymentMethods}
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
            <div className='bg-accent/60 text-accent-foreground grid aspect-4/3 max-h-[40dvh] w-full place-items-center rounded-2xl [@media(max-height:499px)]:max-h-[26dvh]'>
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
          <CopyTextButton
            text={`${window.location.origin}${getThingPagePath(linkId, thing.id)}`}
            label='Copy link'
            copiedLabel='Copied'
            variant='secondary'
            className="relative ml-auto h-[26px]! min-h-0! gap-1 rounded-full px-2.5 py-0! text-xs after:absolute after:inset-x-0 after:-inset-y-[7px] after:content-['']"
          />
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
        {thing.storeUrl !== null && storeHost !== null && (
          <p className='text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm'>
            <span>Where it&apos;s from</span>
            <a
              href={thing.storeUrl}
              target='_blank'
              rel='noopener noreferrer nofollow'
              className='text-primary inline-flex max-w-full min-w-0 items-center gap-1 hover:underline'
            >
              <span className='truncate'>{storeHost}</span>
              <ExternalLink
                className='h-3.5 w-3.5 shrink-0'
                aria-hidden='true'
              />
            </a>
          </p>
        )}
      </div>
    </DetailSheet>
  );
}

export default BuyerThingDrawer;
