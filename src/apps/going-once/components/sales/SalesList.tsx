import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import EmptyCard from '@/components/EmptyCard';
import GatesClosedNote from '@/components/GatesClosedNote';
import LockedButton from '@/components/LockedButton';
import SectionDivider from '@/components/SectionDivider';
import SectionHeader from '@/components/SectionHeader';
import { ADMIN_NAME } from '@lib/app/app.constants';
import { FINISHED_SALE_STATUS } from '@apps/going-once/constants';
import type { Sale } from '@apps/going-once/types';
import { describeFinished } from '@apps/going-once/utils/finish';

interface SalesListProps {
  sales: Sale[];
  canCreate: boolean;
  onOpen: (saleId: string) => void;
  onNew: () => void;
}

/** The sales a person is in, or the first-run card when they are in none. */
function SalesList({ sales, canCreate, onOpen, onNew }: SalesListProps) {
  const renderStart = (label: string, size?: 'sm') =>
    canCreate ? (
      <Button size={size} rounded='full' onClick={onNew}>
        {label}
      </Button>
    ) : (
      <LockedButton
        label={label}
        size={size}
        title='Starting a sale is turned off'
      >
        <p>
          Starting a sale is turned off for you right now. You can still help
          with a sale someone adds you to. Ask {ADMIN_NAME} if you&apos;d like
          it on.
        </p>
      </LockedButton>
    );

  const renderPage = (children: ReactNode) => (
    <div className='page'>
      <div className='mx-auto max-w-2xl space-y-6 pb-8'>
        {children}
        <GatesClosedNote appId='going-once' />
      </div>
    </div>
  );

  if (sales.length === 0) {
    return renderPage(
      <EmptyCard icon='🏷️' action={<div>{renderStart('Start a sale')}</div>}>
        Sell your things with a little help. Add them once, and someone you
        trust does the selling.
      </EmptyCard>,
    );
  }

  const renderSale = (sale: Sale) => (
    <li key={sale.id}>
      <Button
        variant='tertiary'
        className='border-border bg-card h-auto min-h-14 w-full justify-between gap-3 rounded-2xl border px-4 py-2 text-left'
        onClick={() => onOpen(sale.id)}
      >
        <span className='min-w-0 flex-1 text-left'>
          <span className='text-foreground block truncate text-base font-medium'>
            {sale.name}
          </span>
          {sale.status === FINISHED_SALE_STATUS ? (
            <span className='text-muted-foreground line-clamp-2 text-sm font-normal'>
              {describeFinished(sale)}
            </span>
          ) : (
            <span className='text-muted-foreground block truncate text-sm font-normal'>
              {sale.pickupArea ?? 'No pickup area yet'}
            </span>
          )}
        </span>
        <ChevronRight
          className='text-muted-foreground h-4 w-4 shrink-0'
          aria-hidden='true'
        />
      </Button>
    </li>
  );
  const newestFirst = [...sales].sort(
    (first, second) => second.createdAt - first.createdAt,
  );
  const open = newestFirst.filter(
    (sale) => sale.status !== FINISHED_SALE_STATUS,
  );
  const finished = newestFirst.filter(
    (sale) => sale.status === FINISHED_SALE_STATUS,
  );

  return renderPage(
    <>
      <SectionHeader
        title='Your sales'
        action={renderStart('New sale', 'sm')}
      />
      <ul className='space-y-2'>{open.map(renderSale)}</ul>
      {finished.length > 0 && (
        <>
          <SectionDivider label='Finished' />
          <ul className='space-y-2'>{finished.map(renderSale)}</ul>
        </>
      )}
    </>,
  );
}

export default SalesList;
