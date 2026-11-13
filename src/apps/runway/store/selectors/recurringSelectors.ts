import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { resolvePayFromAccountId } from '@apps/runway/engine/accounts';
import { isCardFeeBill } from '@apps/runway/engine/cardFees';
import type { ChargedPlace } from '@apps/runway/engine/chargedTo';
import {
  findRecurringHints,
  type RecurringBill,
  type RecurringHint,
  type RecurringStreamInput,
} from '@apps/runway/engine/recurring';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import {
  selectAllAccounts,
  selectAllCards,
  selectBills,
} from '@apps/runway/store/selectors/runwaySelectors';
import { isRecurringDismissed } from '@apps/runway/utils/recurringDismissed';

const NO_HINTS: RecurringHint[] = [];

const selectRecurringBills = createSelector(
  [
    (state: RootState, today: number) => selectBills(state, today),
    (state: RootState) => state.runway.matchKeys,
  ],
  (bills, matchKeys): RecurringBill[] =>
    bills.map(({ item, version }) => ({
      id: item.id,
      name: version.payload.name,
      merchantKeys: matchKeys[item.id] ?? [],
      amount: version.payload.amount,
      isCardFee: isCardFeeBill(version.payload),
    })),
);

const selectRecurringStreams = createSelector(
  [
    (state: RootState) => state.runway.recurringCharges,
    (state: RootState) => state.runway.links,
    selectAllCards,
    selectAllAccounts,
  ],
  (charges, links, cards, accounts): RecurringStreamInput[] =>
    charges.flatMap(({ id: linkId, streams }) => {
      const link = links.find((one) => one.id === linkId);
      if (!link) return [];
      return streams.flatMap((stream): RecurringStreamInput[] => {
        const provider = link.providerAccounts.find(
          (one) => one.providerAccountId === stream.providerAccountId,
        );
        if (!provider) return [];
        const isPlaced =
          !provider.isSkipped &&
          (provider.cardId !== null || provider.accountId !== null);
        const getPlace = (): ChargedPlace | null => {
          if (!isPlaced) return null;
          if (provider.cardId !== null) {
            return cards.some(
              (card) => card.id === provider.cardId && card.archivedAt === null,
            )
              ? { kind: 'card', id: provider.cardId }
              : null;
          }
          const accountId = resolvePayFromAccountId(
            provider.accountId,
            accounts.filter((account) => account.archivedAt === null),
          );
          return accountId ? { kind: 'account', id: accountId } : null;
        };
        return [
          {
            stream,
            place: getPlace(),
            providerAccount: {
              linkId,
              providerAccountId: provider.providerAccountId,
              name: provider.name,
              mask: provider.mask,
              isPlaced,
            },
          },
        ];
      });
    }),
);

const selectAllHints = createSelector(
  [
    selectLevel,
    (state: RootState) => state.runway.isRecurringChargesLoaded,
    (state: RootState) => state.runway.isLinksLoaded,
    (state: RootState, today: number) => selectRecurringBills(state, today),
    selectRecurringStreams,
  ],
  (level, isLoaded, isLinksLoaded, bills, streams): RecurringHint[] =>
    level === 'link' && isLoaded && isLinksLoaded
      ? findRecurringHints({ bills, streams, dismissed: () => false })
      : NO_HINTS,
);

/** What the bank's repeating charges suggest, minus what the person dismissed on this device. Takes today, the dismissals' version (they live on the device) and the signed-in uid as its arguments. */
export const selectRecurringHints = createSelector(
  [
    (state: RootState, today: number) => selectAllHints(state, today),
    (_state: RootState, _today: number, dismissals: number) => dismissals,
    (_state: RootState, _today: number, _dismissals: number, uid: string) =>
      uid,
  ],
  (hints, _dismissals, uid): RecurringHint[] => {
    const kept = hints.filter((hint) => !isRecurringDismissed(uid, hint.key));
    return kept.length === hints.length ? hints : kept;
  },
);

export const selectBillAmountHint = (
  state: RootState,
  today: number,
  billId: string,
  dismissals: number,
  uid: string,
) =>
  selectRecurringHints(state, today, dismissals, uid).find(
    (hint) => hint.kind === 'amount' && hint.billId === billId,
  ) ?? null;
