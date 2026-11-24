import { useMemo, type ReactNode } from 'react';
import { CreditCard, Shapes, Store } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import FormSheet from '@/components/FormSheet';
import SearchInput from '@/components/SearchInput';
import SectionDivider from '@/components/SectionDivider';
import { useAppSelector } from '@/store';
import ItemRow from '@apps/runway/components/ItemRow';
import { RULE_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { canOfferRule } from '@apps/runway/engine/matching';
import { toMerchantKey } from '@apps/runway/engine/rules';
import { useRuleNames } from '@apps/runway/hooks/useRuleNames';
import {
  selectAllCards,
  selectNeedsHomeSections,
  selectRules,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenPurchase, OpenRule } from '@apps/runway/types';
import { getCategoryLabel } from '@apps/runway/utils/ruleText';

/** What a new rule starts from: a store, a card or a kind of purchase, with the store's usual card and kind to narrow it by. */
export interface RuleSeed {
  merchantKey: string | null;
  merchantName: string | null;
  category: string | null;
  cardId: string | null;
}

export type AddRuleView = 'start' | 'cards' | 'kinds';

interface AddRuleSheetProps {
  view: AddRuleView;
  query: string;
  onViewChange: (view: AddRuleView) => void;
  onQueryChange: (query: string) => void;
  onPick: (seed: RuleSeed) => void;
  onOpenRule: (ruleId: string) => void;
  onClose: () => void;
}

const SEARCH_FROM = 5;

const mostCommon = (values: readonly (string | null)[]) =>
  [
    ...values
      .filter((value): value is string => value !== null)
      .reduce(
        (counts, value) => counts.set(value, (counts.get(value) ?? 0) + 1),
        new Map<string, number>(),
      ),
  ].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

interface StoreRow extends RuleSeed {
  merchantKey: string;
  merchantName: string;
  count: number;
}

const isStorePurchase = (purchase: OpenPurchase) =>
  canOfferRule(purchase) &&
  purchase.pairedWithId === null &&
  purchase.incomeDayId === null &&
  (purchase.billRef ?? null) === null;

const toStores = (
  purchases: readonly OpenPurchase[],
  namedKeys: ReadonlySet<string>,
  moveIds: ReadonlySet<string>,
): StoreRow[] =>
  [
    ...purchases
      .filter(
        (purchase) => isStorePurchase(purchase) && !moveIds.has(purchase.id),
      )
      .reduce((byKey, purchase) => {
        const key = toMerchantKey(purchase.merchant);
        if (key === null || namedKeys.has(key)) return byKey;
        const rows = byKey.get(key);
        if (rows) rows.push(purchase);
        else byKey.set(key, [purchase]);
        return byKey;
      }, new Map<string, OpenPurchase[]>()),
  ]
    .map(([merchantKey, rows]) => {
      const latest = [...rows].sort((a, b) => b.date - a.date)[0];
      return {
        merchantKey,
        merchantName: latest.merchant?.trim() || merchantKey,
        category: mostCommon(rows.map((row) => row.category)),
        cardId: mostCommon(rows.map((row) => row.paidByCardId ?? null)),
        count: rows.length,
      };
    })
    .sort(
      (a, b) =>
        b.count - a.count || a.merchantName.localeCompare(b.merchantName),
    );

/** Starts a rule from the Rules screen: a store bought from lately (most often first), everything on a card, or a kind of purchase. */
function AddRuleSheet({
  view,
  query,
  onViewChange,
  onQueryChange,
  onPick,
  onOpenRule,
  onClose,
}: AddRuleSheetProps) {
  const purchases = useAppSelector((state) => state.runway.purchases);
  const rules = useAppSelector(selectRules);
  const cards = useAppSelector(selectAllCards);
  const { getCardLabel, describe } = useRuleNames();
  const today = todayAsUtcDate();
  const moves = useAppSelector(
    (state) => selectNeedsHomeSections(state, today).moves,
  );
  const stores = useMemo(
    () =>
      toStores(
        purchases,
        new Set(
          rules.flatMap((rule) =>
            rule.merchantKey === null ? [] : [rule.merchantKey],
          ),
        ),
        new Set(moves.map(({ purchase }) => purchase.id)),
      ),
    [purchases, rules, moves],
  );
  const findBroadRule = (cardId: string | null, category: string | null) =>
    rules.find(
      (rule) =>
        rule.merchantKey === null &&
        rule.cardId === cardId &&
        rule.category === category,
    ) ?? null;
  const needle = query.trim().toLowerCase();
  const shownStores = stores.filter(
    (row) => needle === '' || row.merchantName.toLowerCase().includes(needle),
  );
  const hasBoughtAny = purchases.some(isStorePurchase);
  const kinds = [
    ...new Set(
      purchases.flatMap((purchase) =>
        isStorePurchase(purchase) && purchase.category !== null
          ? [purchase.category]
          : [],
      ),
    ),
  ]
    .map((code) => ({ code, label: getCategoryLabel(code) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const cardRows = cards.flatMap((card) => {
    const label = getCardLabel(card.id);
    return label === null ? [] : [{ id: card.id, label }];
  });
  const seedOf = (fields: Partial<RuleSeed>): RuleSeed => ({
    merchantKey: null,
    merchantName: null,
    category: null,
    cardId: null,
    ...fields,
  });
  const back = () => onViewChange('start');

  const getTitle = () => {
    if (view === 'cards') return RULE_WORDS.cardTitle;
    if (view === 'kinds') return RULE_WORDS.kindTitle;
    return RULE_WORDS.pickTitle;
  };

  const renderStores = () => {
    if (!hasBoughtAny) {
      return (
        <p className='text-muted-foreground text-sm'>{RULE_WORDS.noStores}</p>
      );
    }
    if (stores.length === 0) {
      return (
        <p className='text-muted-foreground text-sm'>
          {RULE_WORDS.allStoresHaveRules}
        </p>
      );
    }
    return (
      <>
        {stores.length >= SEARCH_FROM && (
          <SearchInput
            value={query}
            onChange={onQueryChange}
            placeholder={RULE_WORDS.searchStores}
          />
        )}
        {shownStores.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            {RULE_WORDS.noStoreMatch}
          </p>
        ) : (
          <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
            {shownStores.map((row) => {
              const card =
                row.cardId === null ? null : getCardLabel(row.cardId);
              const detail = [RULE_WORDS.storeTimes(row.count), card]
                .filter(Boolean)
                .join(' · ');
              return (
                <ItemRow
                  key={row.merchantKey}
                  name={row.merchantName}
                  leading={
                    <span
                      className='border-border bg-accent text-muted-foreground grid size-10 shrink-0 place-items-center rounded-xl border'
                      aria-hidden='true'
                    >
                      <Store className='h-4 w-4' />
                    </span>
                  }
                  detail={detail}
                  isPrivate={false}
                  ariaLabel={`${row.merchantName}, ${detail}`}
                  onOpen={() =>
                    onPick({
                      merchantKey: row.merchantKey,
                      merchantName: row.merchantName,
                      category: row.category,
                      cardId: row.cardId,
                    })
                  }
                />
              );
            })}
          </ul>
        )}
      </>
    );
  };

  const renderChoices = (
    rows: readonly {
      key: string;
      label: string;
      seed: RuleSeed;
      existing: OpenRule | null;
    }[],
    empty: string,
    icon: ReactNode,
  ) =>
    rows.length === 0 ? (
      <p className='text-muted-foreground text-sm'>{empty}</p>
    ) : (
      <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
        {rows.map((row) => {
          const detail = row.existing
            ? RULE_WORDS.hasRule(describe(row.existing, true))
            : undefined;
          return (
            <ItemRow
              key={row.key}
              name={row.label}
              detail={detail}
              leading={
                <span
                  className='border-border bg-accent text-muted-foreground grid size-10 shrink-0 place-items-center rounded-xl border'
                  aria-hidden='true'
                >
                  {icon}
                </span>
              }
              isPrivate={false}
              ariaLabel={detail ? `${row.label}, ${detail}` : row.label}
              onOpen={() =>
                row.existing ? onOpenRule(row.existing.id) : onPick(row.seed)
              }
            />
          );
        })}
      </ul>
    );

  const renderView = () => {
    if (view === 'cards') {
      return renderChoices(
        cardRows.map((card) => ({
          key: card.id,
          label: card.label,
          seed: seedOf({ cardId: card.id }),
          existing: findBroadRule(card.id, null),
        })),
        RULE_WORDS.noCards,
        <CreditCard className='h-4 w-4' />,
      );
    }
    if (view === 'kinds') {
      return renderChoices(
        kinds.map((kind) => ({
          key: kind.code,
          label: kind.label,
          seed: seedOf({ category: kind.code }),
          existing: findBroadRule(null, kind.code),
        })),
        RULE_WORDS.noKinds,
        <Shapes className='h-4 w-4' />,
      );
    }
    return (
      <>
        <ActionGroup>
          <ActionRow
            isGrouped
            icon={<CreditCard />}
            label={RULE_WORDS.pickCard}
            subtitle={RULE_WORDS.pickCardSub}
            hasChevron
            onClick={() => onViewChange('cards')}
          />
          <ActionRow
            isGrouped
            icon={<Shapes />}
            label={RULE_WORDS.pickKind}
            subtitle={RULE_WORDS.pickKindSub}
            hasChevron
            onClick={() => onViewChange('kinds')}
          />
        </ActionGroup>
        <SectionDivider label={RULE_WORDS.stores} />
        {renderStores()}
      </>
    );
  };

  return (
    <FormSheet
      isOpen
      isDrawerWhenShort
      onClose={onClose}
      title={getTitle()}
      viewKey={view}
    >
      <div className='min-h-[min(36rem,70dvh)] space-y-3 pb-4'>
        {view !== 'start' && <BackLink onBack={back} />}
        {renderView()}
      </div>
    </FormSheet>
  );
}

export default AddRuleSheet;
