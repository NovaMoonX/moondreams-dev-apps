import { useEffect, useRef, useState } from 'react';

import LazyMount from '@/components/LazyMount';
import SearchInput from '@/components/SearchInput';
import Subview from '@/components/Subview';
import { useBackStep } from '@/hooks/useBackHistory';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAppSelector } from '@/store';
import { formatDateShortUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import ExpenseView from '@apps/runway/components/ExpenseView';
import ItemRow from '@apps/runway/components/ItemRow';
import { RUNWAY_SEARCH_THRESHOLD, SPEND_WORDS } from '@apps/runway/constants';
import { useGroupedPurchases } from '@apps/runway/hooks/useGroupedPurchases';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import PurchaseScreen from '@apps/runway/screens/spend/PurchaseScreen';
import { selectExpenses } from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenExpense, OpenPurchase } from '@apps/runway/types';

const ROWS_PER_CHUNK = 12;
const ESTIMATED_ROW_HEIGHT = 69;

interface GroupsScreenProps {
  onClose: () => void;
}

const describeGroup = (purchases: readonly OpenPurchase[]) => {
  if (purchases.length === 0) return SPEND_WORDS.groupsNoPurchases;
  const dates = purchases.map((entry) => entry.date);
  const first = Math.min(...dates);
  const last = Math.max(...dates);
  return [
    purchases.length === 1 ? '1 purchase' : `${purchases.length} purchases`,
    first === last
      ? formatDateShortUTC(first)
      : `${formatDateShortUTC(first)} to ${formatDateShortUTC(last)}`,
  ].join(' · ');
};

/** Every expense group, the one used most recently first, each opening its own view. */
function GroupsScreen({ onClose }: GroupsScreenProps) {
  const expenses = useAppSelector(selectExpenses);
  const mask = useMaskedText();
  const read = useGroupedPurchases(true);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [purchaseId, setPurchaseId] = useState<string | null>(null);
  const previousCount = useRef(0);

  useEffect(() => {
    if (previousCount.current > 0 && expenses.length === 0) onClose();
    previousCount.current = expenses.length;
  }, [expenses.length, onClose]);

  useBackStep(openId !== null, () => setOpenId(null));

  if (expenses.length === 0) return null;

  const byGroup = (read.purchases ?? []).reduce<Map<string, OpenPurchase[]>>(
    (acc, entry) =>
      entry.expenseId === null
        ? acc
        : acc.set(entry.expenseId, [
            ...(acc.get(entry.expenseId) ?? []),
            entry,
          ]),
    new Map(),
  );
  const rows = expenses
    .map((expense) => {
      const purchases = byGroup.get(expense.id) ?? [];
      return {
        expense,
        purchases,
        usedOn: purchases[0]?.date ?? expense.updatedAt,
      };
    })
    .sort((a, b) => b.usedOn - a.usedOn);
  const needle =
    expenses.length >= RUNWAY_SEARCH_THRESHOLD
      ? query.trim().toLowerCase()
      : '';
  const matches = rows.filter(
    ({ expense }) =>
      needle === '' || expense.name.toLowerCase().includes(needle),
  );
  const open: OpenExpense | null =
    expenses.find((entry) => entry.id === openId) ?? null;

  const renderRow = ({
    expense,
    purchases,
  }: {
    expense: OpenExpense;
    purchases: OpenPurchase[];
  }) => {
    const total = purchases.reduce((sum, entry) => sum + entry.amountCents, 0);
    return (
      <ItemRow
        key={expense.id}
        name={mask(expense.name)}
        detail={describeGroup(purchases)}
        figure={total < 0 ? `+${formatCents(-total)}` : formatCents(total)}
        onOpen={() => setOpenId(expense.id)}
      />
    );
  };

  const getBody = () => {
    if (read.isFailed) {
      return (
        <p className='text-muted-foreground text-sm'>
          {SPEND_WORDS.groupsFailed}
        </p>
      );
    }
    if (read.purchases === null) {
      return (
        <p className='text-muted-foreground text-sm'>
          {SPEND_WORDS.groupsLoading}
        </p>
      );
    }
    return (
      <>
        {expenses.length >= RUNWAY_SEARCH_THRESHOLD ? (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={SPEND_WORDS.groupsSearch}
          />
        ) : null}
        {matches.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            {SPEND_WORDS.groupsNoMatch}
          </p>
        ) : (
          <div className='border-border divide-border bg-card divide-y rounded-2xl border'>
            {Array.from(
              { length: Math.ceil(matches.length / ROWS_PER_CHUNK) },
              (_, index) =>
                matches.slice(
                  index * ROWS_PER_CHUNK,
                  (index + 1) * ROWS_PER_CHUNK,
                ),
            ).map((chunk, index) => (
              <LazyMount
                key={chunk[0].expense.id}
                eager={index === 0}
                estimatedHeight={chunk.length * ESTIMATED_ROW_HEIGHT}
              >
                <ul className='divide-border divide-y'>
                  {chunk.map(renderRow)}
                </ul>
              </LazyMount>
            ))}
          </div>
        )}
      </>
    );
  };

  return (
    <>
      <Subview
        overlay
        title={open ? mask(open.name) : SPEND_WORDS.groups}
        onClose={onClose}
        onBack={open ? () => setOpenId(null) : undefined}
        headerAction={<ValuesEyeButton />}
      >
        <div className='space-y-4'>
          {open ? (
            <ExpenseView
              expenseId={open.id}
              hasBackLink={false}
              purchases={
                read.purchases === null ? null : (byGroup.get(open.id) ?? [])
              }
              isFailed={read.isFailed}
              onBack={() => setOpenId(null)}
              onOpenPurchase={setPurchaseId}
            />
          ) : (
            getBody()
          )}
        </div>
      </Subview>
      {purchaseId !== null && (
        <PurchaseScreen
          key={purchaseId}
          purchaseId={purchaseId}
          fallback={
            read.purchases?.find((entry) => entry.id === purchaseId) ?? null
          }
          onOpen={setPurchaseId}
          onClose={() => setPurchaseId(null)}
          hasGroupLink={false}
        />
      )}
    </>
  );
}

export default GroupsScreen;
