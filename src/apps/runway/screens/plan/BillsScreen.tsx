import { useState, type CSSProperties } from 'react';
import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Receipt } from 'lucide-react';

import EmptyCard from '@/components/EmptyCard';
import StoppedHoldingList from '@apps/runway/components/StoppedHoldingList';
import FloatingAction from '@/components/FloatingAction';
import HelpTip from '@/components/HelpTip';
import LazyMount from '@/components/LazyMount';
import SearchInput from '@/components/SearchInput';
import SectionDivider from '@/components/SectionDivider';
import SectionHeader from '@/components/SectionHeader';
import SensitiveValue from '@/components/SensitiveValue';
import { useNow } from '@/hooks/useNow';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import { formatDateShortUTC } from '@/utils/formatUtils';
import { GROUP_WORDS, RUNWAY_SEARCH_THRESHOLD } from '@apps/runway/constants';
import BillRow from '@apps/runway/components/BillRow';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { RangeBasisNote } from '@apps/runway/components/RangeNote';
import { monthlyTotal } from '@apps/runway/engine/groups';
import BillForm from '@apps/runway/forms/BillForm';
import GroupSheet from '@apps/runway/forms/GroupSheet';
import { describeGroupTotal } from '@apps/runway/utils/billText';
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
const ESTIMATED_ROW_HEIGHT = 69;

function BillsScreen() {
  const { isHidden } = useValuesHidden();
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

  const hasSearch = bills.length >= RUNWAY_SEARCH_THRESHOLD;
  const needle = hasSearch ? query.trim().toLowerCase() : '';
  const groupIds = new Set(groups.map(({ item }) => item.id));
  const listed = bills.map(({ item, version }) => {
    const payment =
      (payments[item.id] ?? []).find((entry) => entry.dueOn >= today) ?? null;
    const { groupId } = version.payload;
    return {
      item,
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
  const sections = groups
    .map(({ item, version }) => {
      const members = listed.filter((entry) => entry.groupId === item.id);
      return {
        id: item.id,
        name: version.payload.name,
        rows: members.filter(isShown),
        total: monthlyTotal(
          members.map(({ payload }) => ({
            amount: payload.amount,
            schedule: payload.timing.schedule,
          })),
          today,
        ),
        count: members.length,
      };
    })
    .filter(({ rows }) => needle === '' || rows.length > 0);
  const ungrouped = visible.filter(({ groupId }) => groupId === null);
  const openSection = sections.find(({ id }) => id === openGroupId);

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
              {chunk.map(({ item, payload, payment }) => (
                <BillRow
                  key={item.id}
                  billId={item.id}
                  bill={payload}
                  payment={payment}
                  planStance={stance}
                  today={today}
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
            {sections.map(({ id, name, rows, total, count }) => (
              <div key={id} className='space-y-2'>
                <SectionDivider
                  label={
                    <Button
                      type='button'
                      variant='tertiary'
                      size='sm'
                      aria-label={GROUP_WORDS.openLabel(name)}
                      className="relative after:absolute after:-inset-2 after:content-['']"
                      onClick={() => setOpenGroupId(id)}
                    >
                      {name}
                    </Button>
                  }
                  trailing={
                    <span className='text-muted-foreground flex items-center gap-1 text-sm'>
                      <span>
                        <SensitiveValue>
                          {describeGroupTotal(total)}
                        </SensitiveValue>{' '}
                        a month
                      </span>
                      {!isHidden && total.lowCents !== total.highCents && (
                        <HelpTip title={GROUP_WORDS.basisTitle}>
                          <p>{GROUP_WORDS.rangeTotal}</p>
                          <RangeBasisNote stance={stance} side='expense' />
                        </HelpTip>
                      )}
                    </span>
                  }
                />
                {count > 0 && rows.length > 0 && getCard(rows)}
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
      {openSection && (
        <GroupSheet
          groupId={openSection.id}
          total={openSection.total}
          billCount={openSection.count}
          today={today}
          onClose={() => setOpenGroupId(null)}
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
