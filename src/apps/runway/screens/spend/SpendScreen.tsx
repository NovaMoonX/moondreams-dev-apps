import { useState } from 'react';
import { Wallet } from 'lucide-react';

import { Button, Select } from '@moondreamsdev/dreamer-ui/components';

import EmptyCard from '@/components/EmptyCard';
import { PillGroup } from '@/components/PillGroup';
import SearchInput from '@/components/SearchInput';
import SectionDivider from '@/components/SectionDivider';
import SectionHeader from '@/components/SectionHeader';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useAppSelector } from '@/store';
import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import PurchaseRow from '@apps/runway/components/PurchaseRow';
import {
  SPEND_PAGE_SIZE,
  SPEND_PILL_LIMIT,
  SPEND_SEARCH_THRESHOLD,
  SPEND_WORDS,
} from '@apps/runway/constants';
import PurchaseForm from '@apps/runway/forms/PurchaseForm';
import { selectRecentFrom } from '@apps/runway/store/selectors/historySelectors';
import {
  selectItemLooks,
  selectIsMovesLoaded,
  selectSpendPurchases,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenPurchase } from '@apps/runway/types';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import { getPurchaseTitle } from '@apps/runway/utils/purchaseText';

const ALL_ENVELOPES = 'all';

const monthLabel = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Groups newest-first purchases under the month they happened in. */
const groupByMonth = (purchases: readonly OpenPurchase[]) =>
  purchases.reduce<{ label: string; rows: OpenPurchase[] }[]>((groups, row) => {
    const label = monthLabel.format(row.date);
    const last = groups.at(-1);
    return last && last.label === label
      ? [...groups.slice(0, -1), { label, rows: [...last.rows, row] }]
      : [...groups, { label, rows: [row] }];
  }, []);

/** What was spent since the newest closing, newest first; earlier purchases are counted in the figures and arrive with the history view. Search covers the window in view. */
function SpendScreen() {
  const isLoaded = useAppSelector(selectIsMovesLoaded);
  const purchases = useAppSelector(selectSpendPurchases);
  const recentFrom = useAppSelector(selectRecentFrom);
  const startDate = useAppSelector(
    (state) => state.runway.plan?.startDate ?? null,
  );
  const looks = useAppSelector(selectItemLooks);
  const { spendEnvelope, showSpendEnvelope, openPurchase } =
    useRunwayUrlState();
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(SPEND_PAGE_SIZE);
  const [formKey, setFormKey] = useState<number | null>(null);

  const nameOf = (envelopeId: string) =>
    looks.get(envelopeId)?.name ?? 'An envelope';
  const counts = purchases.reduce<Map<string, number>>((acc, purchase) => {
    new Set(purchase.lines.map((line) => line.envelopeId)).forEach((id) => {
      if (id !== null) acc.set(id, (acc.get(id) ?? 0) + 1);
    });
    return acc;
  }, new Map());
  const filterId =
    spendEnvelope !== null && counts.has(spendEnvelope) ? spendEnvelope : null;
  const needle =
    purchases.length >= SPEND_SEARCH_THRESHOLD
      ? query.trim().toLowerCase()
      : '';
  const matches = purchases.filter(
    (purchase) =>
      (filterId === null ||
        purchase.lines.some((line) => line.envelopeId === filterId)) &&
      (needle === '' ||
        `${getPurchaseTitle(purchase, nameOf)} ${purchase.merchant ?? ''} ${purchase.note ?? ''} ${purchase.lines.map((line) => (line.envelopeId === null ? SPEND_WORDS.freeToSpend : nameOf(line.envelopeId))).join(' ')} ${formatCents(Math.abs(purchase.amountCents))}`
          .toLowerCase()
          .includes(needle)),
  );
  const visible = matches.slice(0, shown);
  const isWholeLedger = recentFrom === null || recentFrom <= (startDate ?? 0);
  const windowNote = isWholeLedger
    ? null
    : `${SPEND_WORDS.windowFrom} ${formatDateUTC(recentFrom)}. ${SPEND_WORDS.windowNote}`;
  const groups = groupByMonth(visible);

  const filterOptions = [
    {
      value: '',
      label: SPEND_WORDS.all,
      detail: String(purchases.length),
      ariaLabel: `${SPEND_WORDS.all}, ${purchases.length}`,
    },
    ...[...counts.entries()]
      .map(([id, count]) => ({
        value: id,
        label: nameOf(id),
        detail: String(count),
        ariaLabel: `${nameOf(id)}, ${count}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];

  const getBody = () => {
    if (!isLoaded) {
      return (
        <p className='text-muted-foreground text-sm'>{SPEND_WORDS.loading}</p>
      );
    }
    if (purchases.length === 0) {
      return (
        <EmptyCard icon={<Wallet className='h-5 w-5' />}>
          {SPEND_WORDS.empty}
        </EmptyCard>
      );
    }
    return (
      <div className='space-y-4'>
        {purchases.length >= SPEND_SEARCH_THRESHOLD && (
          <SearchInput
            value={query}
            onChange={(text) => {
              setQuery(text);
              setShown(SPEND_PAGE_SIZE);
            }}
            placeholder={SPEND_WORDS.search}
          />
        )}
        {filterOptions.length > SPEND_PILL_LIMIT && (
          <div className='space-y-1.5'>
            <p className='text-muted-foreground text-xs'>
              {SPEND_WORDS.envelope}
            </p>
            <Select
              searchable
              options={filterOptions.map((option) => ({
                text: `${option.label} · ${option.detail}`,
                value: option.value === '' ? ALL_ENVELOPES : option.value,
              }))}
              value={filterId ?? ALL_ENVELOPES}
              onChange={(value) => {
                showSpendEnvelope(value === ALL_ENVELOPES ? null : value);
                setShown(SPEND_PAGE_SIZE);
              }}
            />
          </div>
        )}
        {counts.size >= 2 && filterOptions.length <= SPEND_PILL_LIMIT && (
          <PillGroup
            isThin
            label='Envelope'
            options={filterOptions}
            value={filterId ?? ''}
            onChange={(value) => {
              showSpendEnvelope(value === '' ? null : value);
              setShown(SPEND_PAGE_SIZE);
            }}
          />
        )}
        {matches.length === 0 ? (
          <p className='text-muted-foreground text-sm'>{SPEND_WORDS.noMatch}</p>
        ) : (
          groups.map((group) => (
            <div key={group.label} className='space-y-2'>
              <SectionDivider label={group.label} />
              <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                {group.rows.map((purchase) => (
                  <PurchaseRow
                    key={purchase.id}
                    purchase={purchase}
                    looks={looks}
                    onOpen={() => openPurchase(purchase.id)}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
        {matches.length > visible.length && (
          <ShowMoreButton
            onClick={() => setShown((current) => current + SPEND_PAGE_SIZE)}
          >
            Show {Math.min(SPEND_PAGE_SIZE, matches.length - visible.length)}{' '}
            more
          </ShowMoreButton>
        )}
        {windowNote && (
          <p className='text-muted-foreground text-xs'>{windowNote}</p>
        )}
      </div>
    );
  };

  return (
    <div className='space-y-4'>
      <SectionHeader
        title={SPEND_WORDS.title}
        action={
          <Button
            variant='secondary'
            size='sm'
            onClick={() => setFormKey((current) => (current ?? 0) + 1)}
          >
            + {SPEND_WORDS.newPurchase}
          </Button>
        }
      />
      {getBody()}
      {formKey !== null && (
        <PurchaseForm
          key={formKey}
          isOpen
          presetEnvelopeId={filterId}
          onClose={() => setFormKey(null)}
        />
      )}
    </div>
  );
}

export default SpendScreen;
