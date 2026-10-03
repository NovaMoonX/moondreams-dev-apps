import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Settings } from 'lucide-react';

import SectionHeader from '@/components/SectionHeader';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { formatDateUTC } from '@/utils/formatUtils';
import MembershipSettingsModal from '@apps/a-list/components/dashboard/MembershipSettingsModal';
import StatTile from '@apps/a-list/components/shared/StatTile';
import { selectSavingsSummary } from '@apps/a-list/store/selectors';
import type { MembershipProfile } from '@apps/a-list/types';
import { formatCents } from '@apps/a-list/utils/money';

interface DashboardScreenProps {
  membership: MembershipProfile;
}

function DashboardScreen({ membership }: DashboardScreenProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const now = useNow();
  const summary = useAppSelector((state) => selectSavingsSummary(state, now));

  const getMonthsLine = () => {
    if (!summary || summary.cyclesElapsed === 0)
      return `Billing starts ${formatDateUTC(membership.startDate)}`;
    const months =
      summary.cyclesElapsed === 1
        ? '1 month'
        : `${summary.cyclesElapsed} months`;
    return `${months} billed since ${formatDateUTC(membership.startDate)}`;
  };

  return (
    <section className='space-y-4'>
      <SectionHeader
        title='Dashboard'
        action={
          <Button
            type='button'
            variant='tertiary'
            size='icon'
            aria-label='Membership settings'
            onClick={() => setIsSettingsOpen(true)}
          >
            <Settings className='h-5 w-5' />
          </Button>
        }
      />
      {summary && (
        <div className='space-y-3'>
          <div className='grid grid-cols-2 gap-3'>
            <StatTile
              label='Monthly cost'
              value={formatCents(summary.monthlyTotalCents)}
              detail={
                <>
                  {membership.taxRate === null ? 'before tax' : 'tax included'}
                  <br />
                  {getMonthsLine()}
                </>
              }
            />
            <StatTile
              label='Ticket savings'
              value={formatCents(summary.totalTicketSavingsCents)}
            />
            <StatTile
              label='Net savings'
              value={
                <span
                  className={join(
                    summary.netSavingsCents < 0 && 'text-muted-foreground',
                  )}
                >
                  {formatCents(summary.netSavingsCents)}
                </span>
              }
              detail={`after ${formatCents(summary.membershipCostCents)} of membership`}
            />
            <StatTile
              label='Break-even'
              value={summary.isBrokenEven ? 'Broken even' : 'Not yet'}
            />
            <StatTile
              label='Premium format savings'
              value={formatCents(summary.premiumFormatSavingsCents)}
            />
            <StatTile
              label='Convenience fees avoided'
              value={formatCents(summary.feesAvoidedCents)}
            />
          </div>
          {summary.unpricedCount > 0 && (
            <p className='text-muted-foreground text-sm'>
              {summary.unpricedCount === 1
                ? "1 movie doesn't have prices yet."
                : `${summary.unpricedCount} movies don't have prices yet.`}{' '}
              Mark them paid to count their savings.
            </p>
          )}
          {summary.premiumUnpricedCount > 0 && (
            <p className='text-muted-foreground text-sm'>
              {summary.premiumUnpricedCount === 1
                ? '1 premium ticket has no standard price, so it adds nothing to premium savings.'
                : `${summary.premiumUnpricedCount} premium tickets have no standard price, so they add nothing to premium savings.`}
            </p>
          )}
        </div>
      )}
      {isSettingsOpen && (
        <MembershipSettingsModal
          membership={membership}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </section>
  );
}

export default DashboardScreen;
