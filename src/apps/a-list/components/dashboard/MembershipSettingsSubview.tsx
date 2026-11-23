import { useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { PillGroup } from '@/components/PillGroup';
import FormSheet from '@/components/FormSheet';
import SettingsGroup from '@/components/SettingsGroup';
import SettingsRow from '@/components/SettingsRow';
import ExternalLinkText from '@/components/ExternalLinkText';
import GatesClosedNote from '@/components/GatesClosedNote';
import Subview from '@/components/Subview';
import { useIsGateOpen } from '@/hooks/useFeatureGates';
import { useAppDispatch } from '@/store';
import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import EmailTicketsRow from '@apps/a-list/components/email/EmailTicketsRow';
import {
  CostSheet,
  GoalsSheet,
  StartDateSheet,
} from '@apps/a-list/components/dashboard/MembershipSettingsSheets';
import {
  CALENDAR_RELEASES_GATE_ID,
  EMAIL_TICKETS_GATE_ID,
  TICKET_PRICE_KIND_LABELS,
  TICKET_PRICE_KINDS,
} from '@apps/a-list/constants';
import {
  updateMembership,
  type MembershipEditableFields,
} from '@apps/a-list/store/actions/membershipActions';
import type { MembershipProfile } from '@apps/a-list/types';
import { getTicketPriceKind } from '@apps/a-list/utils/ticketPrice';

type SettingsSheetName =
  'cost' | 'start' | 'ticketPrice' | 'releases' | 'goals';

function getCostSummary(membership: MembershipProfile) {
  const base = `${formatCents(membership.monthlyCostCents)} a month`;
  return membership.taxRate === null
    ? base
    : `${base} · ${formatCents(membership.monthlyTotalCents)} with tax`;
}

function getGoalsSummary(membership: MembershipProfile) {
  const parts = [
    membership.weeklyGoal === null ? null : `${membership.weeklyGoal} a week`,
    membership.monthlyGoal === null
      ? null
      : `${membership.monthlyGoal} a month`,
  ].filter((part) => part !== null);
  return parts.length === 0 ? 'No goals yet' : parts.join(' · ');
}

interface MembershipSettingsSubviewProps {
  membership: MembershipProfile;
  onClose: () => void;
}

function MembershipSettingsSubview({
  membership,
  onClose,
}: MembershipSettingsSubviewProps) {
  const canShowReleases = useIsGateOpen('a-list', CALENDAR_RELEASES_GATE_ID);
  const isEmailOpen = useIsGateOpen('a-list', EMAIL_TICKETS_GATE_ID);
  const [openSheet, setOpenSheet] = useState<SettingsSheetName | null>(null);
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const isReleasesShown = membership.showReleasesOnCalendar !== false;
  const save = async (fields: Partial<MembershipEditableFields>) => {
    try {
      await dispatch(
        updateMembership({ uid: membership.uid, fields }),
      ).unwrap();
    } catch {
      addToast({
        title: 'That didn’t save',
        description: 'Check your connection and try again.',
        type: 'error',
      });
    }
  };
  const closeSheet = () => setOpenSheet(null);
  const sheetProps = { membership, onClose: closeSheet };

  return (
    <Subview title='Membership' onClose={onClose}>
      <div className='space-y-4'>
        <div className='bg-secondary/60 flex items-center gap-3 rounded-2xl px-4 py-3'>
          <span className='text-3xl' aria-hidden='true'>
            🎟️
          </span>
          <div className='min-w-0'>
            <p className='font-semibold'>AMC A-List</p>
            <p className='text-muted-foreground text-sm'>
              Member since {formatDateUTC(membership.startDate)}
            </p>
          </div>
        </div>
        <SettingsGroup title='Your membership'>
          <SettingsRow
            icon='💳'
            title='Monthly cost'
            description={getCostSummary(membership)}
            hasChevron
            onClick={() => setOpenSheet('cost')}
          />
          <SettingsRow
            icon='📆'
            title='Start date'
            description={formatDateUTC(membership.startDate)}
            hasChevron
            onClick={() => setOpenSheet('start')}
          />
          <SettingsRow
            icon='🎯'
            title='Goals'
            description={getGoalsSummary(membership)}
            hasChevron
            onClick={() => setOpenSheet('goals')}
          />
        </SettingsGroup>
        <SettingsGroup title='On your screens'>
          <SettingsRow
            icon='🎟️'
            title='Ticket price'
            description={
              TICKET_PRICE_KIND_LABELS[getTicketPriceKind(membership)]
            }
            hasChevron
            onClick={() => setOpenSheet('ticketPrice')}
          />
          {canShowReleases && (
            <SettingsRow
              icon='📅'
              title='Release days'
              description={
                isReleasesShown ? 'Shown on your calendar' : 'Hidden'
              }
              hasChevron
              onClick={() => setOpenSheet('releases')}
            />
          )}
        </SettingsGroup>
        {isEmailOpen && (
          <SettingsGroup title='Automations'>
            <EmailTicketsRow />
          </SettingsGroup>
        )}
        <GatesClosedNote appId='a-list' className='pt-2' />
        <div className='text-muted-foreground space-y-2 pt-2 text-xs'>
          <div className='flex items-center gap-3'>
            <img
              src='/logos/tmdb.svg'
              alt='TMDB'
              className='h-3 w-auto shrink-0'
            />
            <span>
              This product uses the TMDB API but is not endorsed or certified by
              TMDB.
            </span>
          </div>
          <div className='flex flex-wrap items-center gap-1'>
            <span>Some movie details and posters come from</span>
            <ExternalLinkText
              href='https://www.omdbapi.com/'
              label='OMDb'
              className='text-xs'
            />
            <span>(CC BY-NC 4.0).</span>
          </div>
        </div>
      </div>
      {openSheet === 'cost' && <CostSheet {...sheetProps} />}
      {openSheet === 'start' && <StartDateSheet {...sheetProps} />}
      {openSheet === 'ticketPrice' && (
        <FormSheet
          isOpen
          isDrawerWhenShort
          title='Ticket price'
          onClose={closeSheet}
        >
          <div className='space-y-3 pb-4'>
            <PillGroup
              label='Which AMC price should showtimes show?'
              options={TICKET_PRICE_KINDS.map((kind) => ({
                value: kind,
                label: TICKET_PRICE_KIND_LABELS[kind],
              }))}
              value={getTicketPriceKind(membership)}
              onChange={(kind) => void save({ ticketPriceKind: kind })}
            />
            <p className='text-muted-foreground text-sm text-pretty'>
              Tickets you add from a showtime start from this price. Tickets you
              already saved keep theirs.
            </p>
          </div>
        </FormSheet>
      )}
      {openSheet === 'releases' && (
        <FormSheet
          isOpen
          isDrawerWhenShort
          title='Release days'
          onClose={closeSheet}
        >
          <div className='space-y-3 pb-4'>
            <PillGroup
              label='Show release days on your calendar?'
              options={[
                { value: 'show', label: 'Show them' },
                { value: 'hide', label: 'Hide them' },
              ]}
              value={isReleasesShown ? 'show' : 'hide'}
              onChange={(value) =>
                void save({ showReleasesOnCalendar: value === 'show' })
              }
            />
            <p className='text-muted-foreground text-sm text-pretty'>
              {isReleasesShown
                ? 'The day a movie on your watchlist opens gets a dashed gold outline, until you plan it.'
                : 'Your calendar shows only what you’ve planned. The Watchlist still shows what opens this week.'}
            </p>
          </div>
        </FormSheet>
      )}
      {openSheet === 'goals' && <GoalsSheet {...sheetProps} />}
    </Subview>
  );
}

export default MembershipSettingsSubview;
