import { useState, type CSSProperties } from 'react';
import { Receipt } from 'lucide-react';

import EmptyCard from '@/components/EmptyCard';
import StoppedHoldingList from '@apps/runway/components/StoppedHoldingList';
import FloatingAction from '@/components/FloatingAction';
import LazyMount from '@/components/LazyMount';
import SearchInput from '@/components/SearchInput';
import SectionDivider from '@/components/SectionDivider';
import SectionHeader from '@/components/SectionHeader';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { formatDateShortUTC } from '@/utils/formatUtils';
import { GROUP_WORDS, RUNWAY_SEARCH_THRESHOLD } from '@apps/runway/constants';
import BillRow, { BillSheet } from '@apps/runway/components/BillRow';
import GroupHeading from '@apps/runway/components/GroupHeading';
import { useGroupFigures } from '@apps/runway/hooks/useGroupFigures';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import BillForm from '@apps/runway/forms/BillForm';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import GroupSheet from '@apps/runway/forms/GroupSheet';
import {
  selectBills,
  selectBillPayments,
  selectGroups,
  selectIsMovesLoaded,
  selectIsPlanItemsLoaded,
  selectIsRecordsReady,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';

const ROWS_PER_CHUNK = 12;
const TIP_MIN_ROWS = 3;
const ESTIMATED_ROW_HEIGHT = 69;

function BillsScreen() {
  const today = todayAsUtcDate(useNow(60_000));
  const isLoaded = useAppSelector(
    (state) =>
      selectIsPlanItemsLoaded(state) &&
      selectIsMovesLoaded(state) &&
      selectIsRecordsReady(state),
  );
  const bills = useAppSelector((state) => selectBills(state, today));
  const groups = useAppSelector((state) => selectGroups(state, today));
  const payments = useAppSelector((state) => selectBillPayments(state, today));
  const stance = useAppSelector(selectStance);
  const [formKey, setFormKey] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [openBillId, setOpenBillId] = useState<string | null>(null);

  const hasSearch = bills.length >= RUNWAY_SEARCH_THRESHOLD;
  const needle = hasSearch ? query.trim().toLowerCase() : '';
  const groupIds = new Set(groups.map(({ item }) => item.id));
  const listed = bills.map(({ item, version }) => {
    const payment =
      (payments[item.id] ?? []).find((entry) => entry.dueOn >= today) ?? null;
    const { groupId } = version.payload;
    return {
      item,
      startsOn: version.effectiveFrom,
      payload: version.payload,
      payment,
      groupId: groupId !== null && groupIds.has(groupId) ? groupId : null,
    };
  });
  const isShown = ({ payload, payment }: (typeof listed)[number]) =>
    `${payload.name} ${payment ? formatDateShortUTC(payment.dueOn) : ''}`
      .toLowerCase()
      .includes(needle);
  const visible = listed.filter(isShown);
  const figuresByGroup = useGroupFigures(today);
  const sections = figuresByGroup
    .map((figures) => ({
      figures,
      rows: listed
        .filter((entry) => entry.groupId === figures.id)
        .filter(isShown),
    }))
    .filter(
      ({ figures, rows }) =>
        rows.length > 0 ||
        (needle === '' &&
          figures.bills.length + figures.envelopes.length === 0),
    );
  const isShowingTip =
    bills.length >= TIP_MIN_ROWS &&
    figuresByGroup.every(({ bills: inGroup }) => inGroup.length === 0);
  const ungrouped = visible.filter(({ groupId }) => groupId === null);
  const { dueBillId, closeDueBill } = useRunwayUrlState();
  const openBill = listed.find(({ item, payload }) =>
    openBillId !== null
      ? item.id === openBillId
      : item.id === dueBillId && payload.timing.schedule.anchor === null,
  );

  const getCard = (rows: typeof visible) => (
    <div className='border-border divide-border bg-card divide-y rounded-2xl border'>
      {Array.from(
        { length: Math.ceil(rows.length / ROWS_PER_CHUNK) },
        (_, index) =>
          rows.slice(index * ROWS_PER_CHUNK, (index + 1) * ROWS_PER_CHUNK),
      ).map((chunk, index) => (
        <div
          key={chunk[0].item.id}
          className='defer-offscreen'
          style={
            {
              '--defer-size': `${chunk.length * ESTIMATED_ROW_HEIGHT}px`,
            } as CSSProperties
          }
        >
          <LazyMount
            eager={index === 0}
            estimatedHeight={chunk.length * ESTIMATED_ROW_HEIGHT}
          >
            <ul className='divide-border divide-y'>
              {chunk.map(({ item, payload, payment, groupId }) => (
                <BillRow
                  key={item.id}
                  bill={payload}
                  payment={payment}
                  planStance={stance}
                  onOpen={() => setOpenBillId(item.id)}
                  isOutsideTotal={
                    groupId !== null && payload.timing.schedule.kind === 'once'
                  }
                />
              ))}
            </ul>
          </LazyMount>
        </div>
      ))}
    </div>
  );

  const getBody = () => {
    if (!isLoaded) {
      return (
        <p className='text-muted-foreground text-sm'>Getting your bills.</p>
      );
    }
    if (bills.length === 0) {
      return (
        <EmptyCard icon={<Receipt className='h-5 w-5' />}>
          A bill has an exact amount and a due date. Add one and it is set aside
          a little at a time from the income days before it is due.
        </EmptyCard>
      );
    }
    return (
      <div className='space-y-3'>
        {hasSearch && (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder='Search bills'
          />
        )}
        {visible.length === 0 ? (
          <p className='text-muted-foreground text-sm'>No bill matches that.</p>
        ) : (
          <>
            {sections.map(({ figures, rows }) => (
              <div key={figures.id} className='space-y-2'>
                <GroupHeading
                  figures={figures}
                  onOpen={() => setOpenGroupId(figures.id)}
                />
                {rows.length > 0 && getCard(rows)}
              </div>
            ))}
            {ungrouped.length > 0 && (
              <div className='space-y-2'>
                {sections.length > 0 && (
                  <SectionDivider label={GROUP_WORDS.ungrouped} />
                )}
                {getCard(ungrouped)}
              </div>
            )}
          </>
        )}
        {isShowingTip && (
          <p className='text-muted-foreground text-sm'>{GROUP_WORDS.setTip}</p>
        )}
      </div>
    );
  };

  return (
    <div className='space-y-4'>
      <SectionHeader title='Bills' />
      {getBody()}
      {isLoaded && <StoppedHoldingList kind='bill' today={today} />}
      <FloatingAction
        label='Add a bill'
        icon={<Receipt className='h-5 w-5' aria-hidden='true' />}
        onClick={() => setFormKey((current) => (current ?? 0) + 1)}
      />
      {openGroupId !== null && (
        <GroupSheet
          groupId={openGroupId}
          today={today}
          onClose={() => setOpenGroupId(null)}
        />
      )}
      {openBill && (
        <BillSheet
          key={openBill.item.id}
          billId={openBill.item.id}
          bill={openBill.payload}
          payment={openBill.payment}
          planStance={stance}
          today={today}
          startsAtStep={openBillId === null ? 'due' : undefined}
          onClose={() => {
            setOpenBillId(null);
            closeDueBill();
          }}
        />
      )}
      {formKey !== null && (
        <BillForm
          key={formKey}
          isOpen
          title='Bill'
          onClose={() => setFormKey(null)}
        />
      )}
    </div>
  );
}

export default BillsScreen;
