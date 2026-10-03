import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight, Settings } from 'lucide-react';

import SectionHeader from '@/components/SectionHeader';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { formatDateUTC } from '@/utils/formatUtils';
import StatTile from '@apps/a-list/components/shared/StatTile';
import TicketsList, {
  type TicketsView,
} from '@apps/a-list/components/dashboard/TicketsList';
import { useAListOverlay } from '@apps/a-list/hooks/useAListOverlay';
import {
  selectSavingsSummary,
  selectSeenTicketGroups,
} from '@apps/a-list/store/selectors';
import type { MembershipProfile } from '@apps/a-list/types';
import { formatCents } from '@apps/a-list/utils/money';

interface DashboardScreenProps {
  membership: MembershipProfile;
}

function DashboardScreen({ membership }: DashboardScreenProps) {
  const { openOverlay } = useAListOverlay();
  const now = useNow();
  const summary = useAppSelector((state) => selectSavingsSummary(state, now));
  const { paid, unpriced } = useAppSelector(selectSeenTicketGroups);
  const [ticketsView, setTicketsView] = useState<TicketsView | null>(null);

  if (ticketsView !== null) {
    return (
      <TicketsList
        key={ticketsView}
        initialView={ticketsView}
        onBack={() => setTicketsView(null)}
      />
    );
  }

  const getMonthsLine = () => {
    if (!summary || summary.cyclesElapsed === 0)
      return `Billing starts ${formatDateUTC(membership.startDate)}`;
    const months =
      summary.cyclesElapsed === 1
        ? '1 month'
        : `${summary.cyclesElapsed} months`;
    return `${months} billed since ${formatDateUTC(membership.startDate)}`;
  };

  const renderTicketsRow = (
    view: TicketsView,
    emoji: string,
    label: string,
    count: number,
    isHighlighted: boolean,
  ) => (
    <Button
      type='button'
      variant='tertiary'
      className='text-foreground! h-auto w-full justify-start gap-3 rounded-none px-3 py-2.5 font-normal'
      onClick={() => setTicketsView(view)}
    >
      <span
        className='bg-secondary grid size-9 shrink-0 place-items-center rounded-full text-lg'
        aria-hidden='true'
      >
        {emoji}
      </span>
      <span className='flex-1 text-left'>{label}</span>
      <span
        className={join(
          'rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
          isHighlighted
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground',
        )}
      >
        {count}
      </span>
      <ChevronRight className='text-muted-foreground h-4 w-4' />
    </Button>
  );

  return (
    <section className='space-y-4'>
      <SectionHeader
        title='Dashboard'
        action={
          <Button
            type='button'
            variant='secondary'
            size='icon'
            rounded='full'
            aria-label='Membership settings'
            onClick={() => openOverlay({ kind: 'membership' })}
          >
            <Settings className='h-5 w-5' />
          </Button>
        }
      />
      {summary && (
        <div className='space-y-4'>
          <div className='border-border bg-card rounded-3xl border p-5 shadow-sm'>
            <p className='text-muted-foreground flex items-center gap-2 text-sm font-medium'>
              <span
                className='bg-accent grid size-8 place-items-center rounded-full text-base'
                aria-hidden='true'
              >
                💰
              </span>
              Net savings
            </p>
            <p
              className={join(
                'mt-2 text-5xl font-bold tracking-tight tabular-nums',
                summary.isBrokenEven ? 'text-success' : 'text-foreground',
              )}
            >
              {formatCents(summary.netSavingsCents)}
            </p>
            <p className='text-muted-foreground mt-2 text-sm'>
              {formatCents(summary.totalTicketSavingsCents)} in tickets, after{' '}
              {formatCents(summary.membershipCostCents)} of membership
            </p>
            <p
              className={join(
                'mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium',
                summary.isBrokenEven
                  ? 'bg-success/15 text-success'
                  : 'bg-accent text-accent-foreground',
              )}
            >
              <span aria-hidden='true'>
                {summary.isBrokenEven ? '🎉' : '🎯'}
              </span>
              {summary.isBrokenEven
                ? 'You have broken even'
                : `${formatCents(-summary.netSavingsCents)} to break even`}
            </p>
          </div>
          <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
            <StatTile
              icon='🎟️'
              label='Ticket savings'
              value={formatCents(summary.totalTicketSavingsCents)}
            />
            <StatTile
              icon='💳'
              label='Monthly cost'
              value={formatCents(summary.monthlyTotalCents)}
              detail={
                membership.taxRate === null ? 'before tax' : 'tax included'
              }
            />
            <StatTile
              icon='📽️'
              label='Premium formats'
              value={formatCents(summary.premiumFormatSavingsCents)}
            />
            <StatTile
              icon='💸'
              label='Fees avoided'
              value={formatCents(summary.feesAvoidedCents)}
            />
          </div>
          <p className='text-muted-foreground text-center text-xs'>
            {getMonthsLine()}
          </p>
          <div className='border-border bg-card divide-border divide-y overflow-hidden rounded-2xl border'>
            {renderTicketsRow(
              'unpriced',
              '🧾',
              'Needs a price',
              unpriced.length,
              unpriced.length > 0,
            )}
            {renderTicketsRow('paid', '💵', 'Paid tickets', paid.length, false)}
          </div>
          {summary.premiumUnpricedCount > 0 && (
            <p className='text-muted-foreground text-sm'>
              {summary.premiumUnpricedCount === 1
                ? '1 premium ticket has no standard price, so it adds nothing to premium savings.'
                : `${summary.premiumUnpricedCount} premium tickets have no standard price, so they add nothing to premium savings.`}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export default DashboardScreen;
