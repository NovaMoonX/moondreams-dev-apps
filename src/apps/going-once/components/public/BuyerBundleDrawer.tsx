import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Camera } from 'lucide-react';

import DetailSheet from '@/components/DetailSheet';
import FallbackImage from '@/components/FallbackImage';
import InlineNotice from '@/components/InlineNotice';
import { formatCentsShort } from '@/utils/moneyUtils';
import InterestView from '@apps/going-once/components/public/InterestView';
import PriceTag from '@apps/going-once/components/things/PriceTag';
import StatusDot from '@apps/going-once/components/things/StatusDot';
import { usePublicPhotoUrls } from '@apps/going-once/queries/publicPhotoQueries';
import type { PublicBundle, PublicThing } from '@apps/going-once/types';

interface BuyerBundleDrawerProps {
  bundle: PublicBundle;
  /** The bundle's things in its order. */
  things: PublicThing[];
  linkId: string;
  paymentMethods: string[];
  onOpenThing: (id: string) => void;
  onClose: () => void;
}

function BundleThingRow({
  thing,
  onOpen,
}: {
  thing: PublicThing;
  onOpen: () => void;
}) {
  const cover = usePublicPhotoUrls(thing.photos.slice(0, 1), 's')[0]?.url;
  const placeholder = (
    <Camera className='size-5 opacity-60' aria-hidden='true' />
  );
  return (
    <Button
      type='button'
      variant='tertiary'
      className='border-border bg-card h-auto w-full justify-start gap-3! rounded-2xl! border p-2! text-left'
      onClick={onOpen}
    >
      <span className='bg-accent/60 text-accent-foreground grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl'>
        {cover ? (
          <FallbackImage
            src={cover}
            alt=''
            className='size-full object-cover'
            fallback={placeholder}
          />
        ) : (
          placeholder
        )}
      </span>
      <span className='text-foreground line-clamp-2 min-w-0 flex-1 text-sm leading-snug font-medium break-words'>
        {thing.title}
      </span>
      <PriceTag askingPriceCents={thing.askingPriceCents} />
    </Button>
  );
}

/** A bundle's public details in a drawer (a modal from `sm`): what it costs, the things it holds, how many have gone, and one way to say you want it all. */
function BuyerBundleDrawer({
  bundle,
  things,
  linkId,
  paymentMethods,
  onOpenThing,
  onClose,
}: BuyerBundleDrawerProps) {
  const [isAsking, setIsAsking] = useState(false);
  const [footerNode, setFooterNode] = useState<HTMLElement | null>(null);
  const [refusal, setRefusal] = useState<'not_found' | 'not_available' | null>(
    null,
  );
  const savedCents = bundle.separateCents - bundle.priceCents;

  return (
    <DetailSheet
      isOpen
      onClose={onClose}
      title={bundle.name}
      viewKey={isAsking ? 'interest' : 'bundle'}
      footer={
        isAsking ? (
          <div ref={setFooterNode} />
        ) : (
          <div className='space-y-3'>
            {refusal !== null && (
              <p className='text-muted-foreground text-center text-sm'>
                {refusal === 'not_available'
                  ? 'This bundle just went, sorry.'
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
                  I&apos;m interested in the bundle
                </Button>
              )}
            </div>
          </div>
        )
      }
    >
      {isAsking && (
        <InterestView
          thing={things[0]}
          bundle={bundle}
          linkId={linkId}
          paymentMethods={paymentMethods}
          footerNode={footerNode}
          onBack={() => setIsAsking(false)}
          onDone={onClose}
          onRefused={setRefusal}
        />
      )}
      <div className={isAsking ? 'hidden' : 'space-y-4'}>
        <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
          <PriceTag askingPriceCents={bundle.priceCents} />
          {savedCents > 0 && (
            <span className='text-muted-foreground text-sm'>
              <span className='line-through'>
                {formatCentsShort(bundle.separateCents)}
              </span>{' '}
              · Save {formatCentsShort(savedCents)} when you take them all
            </span>
          )}
          {bundle.status === 'PENDING' && <StatusDot status='PENDING' />}
        </div>
        {bundle.status === 'PENDING' && (
          <InlineNotice tone='info'>
            Pending · someone&apos;s picking this up.
          </InlineNotice>
        )}
        <ul className='space-y-2'>
          {things.map((thing) => (
            <li key={thing.id}>
              <BundleThingRow
                thing={thing}
                onOpen={() => onOpenThing(thing.id)}
              />
            </li>
          ))}
        </ul>
        {bundle.goneCount > 0 && (
          <p className='text-muted-foreground/70 text-sm'>
            {bundle.goneCount === 1
              ? '1 thing from this bundle is already gone'
              : `${bundle.goneCount} things from this bundle are already gone`}
          </p>
        )}
      </div>
    </DetailSheet>
  );
}

export default BuyerBundleDrawer;
