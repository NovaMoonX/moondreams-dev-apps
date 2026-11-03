import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { Button, Skeleton } from '@moondreamsdev/dreamer-ui/components';
import { useQuery } from '@tanstack/react-query';

import ClampedText from '@/components/ClampedText';
import EmptyCard from '@/components/EmptyCard';
import LazyMount from '@/components/LazyMount';
import SearchInput from '@/components/SearchInput';
import SectionDivider from '@/components/SectionDivider';
import { useAuth } from '@/hooks/useAuth';
import { useNoIndex } from '@/hooks/useNoIndex';
import { useOnTabReturn } from '@/hooks/useOnTabReturn';
import BuyerCard from '@apps/going-once/components/public/BuyerCard';
import BuyerThingDrawer from '@apps/going-once/components/public/BuyerThingDrawer';
import { GOING_ONCE_TABS, SEARCH_FROM_ITEMS } from '@apps/going-once/constants';
import { useGoingOnceTheme } from '@apps/going-once/hooks/useGoingOnceTheme';
import { salePageQueryOptions } from '@apps/going-once/queries/salePageQueries';
import type { PublicThing, SalePageResult } from '@apps/going-once/types';

const CARD_HEIGHT = 220;
const EAGER_CARDS = 8;
const SALE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

type OkPage = Extract<SalePageResult, { status: 'ok' }>;

const matchesSearch = (thing: PublicThing, query: string) => {
  const needle = query.trim().toLowerCase();
  return (
    needle === '' ||
    [thing.title, thing.description, thing.brandModel].some((text) =>
      text?.toLowerCase().includes(needle),
    )
  );
};

function Cards({
  things,
  onOpen,
}: {
  things: PublicThing[];
  onOpen: (id: string) => void;
}) {
  return (
    <ul className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4'>
      {things.map((thing, index) => (
        <li key={thing.id} className='min-w-0'>
          <LazyMount estimatedHeight={CARD_HEIGHT} eager={index < EAGER_CARDS}>
            <BuyerCard thing={thing} onOpen={() => onOpen(thing.id)} />
          </LazyMount>
        </li>
      ))}
    </ul>
  );
}

function NotHere() {
  return (
    <div className='flex min-h-[60dvh] flex-col items-center justify-center gap-2 text-center'>
      <h1 className='text-xl font-semibold text-balance'>
        This sale isn&apos;t here anymore.
      </h1>
      <p className='text-muted-foreground text-sm'>
        Ask whoever sent it for a new link.
      </p>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div
      className='mx-auto max-w-3xl space-y-4'
      aria-busy='true'
      aria-label='Opening the sale'
    >
      <Skeleton className='h-8 w-2/3' />
      <Skeleton className='h-4 w-1/2' />
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4'>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className='h-52 w-full' />
        ))}
      </div>
    </div>
  );
}

function PageFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className='mx-auto max-w-md space-y-3 py-10 text-center'>
      <h1 className='text-xl font-semibold'>We couldn&apos;t open this sale</h1>
      <p className='text-muted-foreground text-sm'>
        Check your connection and give it another try.
      </p>
      <Button type='button' className='h-11' onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function OwnPageBand() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const saleId = params.get('sale');
  const tab = GOING_ONCE_TABS.find((choice) => choice === params.get('tab'));
  const backPath =
    saleId !== null && SALE_ID_PATTERN.test(saleId)
      ? `/going-once?sale=${saleId}${tab === undefined ? '' : `&tab=${tab}`}`
      : '/going-once';
  return (
    <div className='bg-accent text-accent-foreground flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3'>
      <p className='text-sm font-medium'>
        This is your sale&apos;s public page
      </p>
      <Button
        type='button'
        size='sm'
        variant='secondary'
        rounded='full'
        onClick={() => navigate(backPath)}
      >
        Back to Going Once
      </Button>
    </div>
  );
}

function SaleView({ page, linkId }: { page: OkPage; linkId: string }) {
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const { sale, things } = page;
  const hasSearch = things.length >= SEARCH_FROM_ITEMS;
  const shown = things.filter(
    (thing) => !hasSearch || matchesSearch(thing, query),
  );
  const available = shown.filter((thing) => thing.status === 'AVAILABLE');
  const pending = shown.filter((thing) => thing.status === 'PENDING');
  const openThing = things.find((thing) => thing.id === openId) ?? null;
  const allAvailable = things.filter((thing) => thing.status === 'AVAILABLE');
  const allPending = things.filter((thing) => thing.status === 'PENDING');
  const summary = [
    allAvailable.length === 0 ? null : `${allAvailable.length} for sale`,
    allPending.length === 0 ? null : `${allPending.length} pending`,
    sale.pickupArea,
  ]
    .filter((part) => part !== null)
    .join(' · ');

  return (
    <div className='mx-auto max-w-3xl space-y-5 lg:max-w-5xl'>
      {page.isMember && <OwnPageBand />}
      <header className='space-y-1'>
        <h1 className='text-[26px] leading-tight font-semibold text-balance break-words'>
          {sale.name}
        </h1>
        {summary !== '' && (
          <p className='text-muted-foreground text-sm'>{summary}</p>
        )}
      </header>
      {sale.buyerNote !== null && (
        <ClampedText text={sale.buyerNote} maxLines={2} />
      )}
      {things.length === 0 && (
        <EmptyCard icon='🏷️'>
          Everything&apos;s found a home. Thanks for looking!
        </EmptyCard>
      )}
      {hasSearch && (
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={`Search ${things.length} things`}
        />
      )}
      {things.length > 0 && shown.length === 0 && (
        <p className='text-muted-foreground text-center text-sm'>
          Nothing matches that. Try another word.
        </p>
      )}
      {available.length > 0 && <Cards things={available} onOpen={setOpenId} />}
      {pending.length > 0 && (
        <>
          <SectionDivider label='Pending' />
          <Cards things={pending} onOpen={setOpenId} />
        </>
      )}
      {openThing && (
        <BuyerThingDrawer
          thing={openThing}
          linkId={linkId}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

/** The public page behind a sale's link: no sign-in to look, and nothing that says who is selling. */
function SalePage() {
  const { linkId = '' } = useParams();
  const { user, loading } = useAuth();
  const query = useQuery({
    ...salePageQueryOptions(linkId, user?.uid ?? null),
    enabled: !loading,
  });

  useGoingOnceTheme();
  useNoIndex();
  useOnTabReturn(() => {
    if (query.data !== undefined) void query.refetch();
  });

  const getContent = () => {
    if (query.isError)
      return <PageFailed onRetry={() => void query.refetch()} />;
    if (query.data === undefined) return <PageSkeleton />;
    if (query.data.status === 'not_found') return <NotHere />;
    return <SaleView key={linkId} page={query.data} linkId={linkId} />;
  };

  return (
    <div className='page pt-4! pb-16'>
      <div className='mx-auto max-w-5xl py-6'>{getContent()}</div>
    </div>
  );
}

export default SalePage;
