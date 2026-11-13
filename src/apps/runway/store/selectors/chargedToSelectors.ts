import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { resolvePayFromAccountId } from '@apps/runway/engine/accounts';
import { isCardFeeBill } from '@apps/runway/engine/cardFees';
import {
  findChargedToHints,
  type ChargedPlace,
  type ChargedToBill,
  type ChargedToHint,
} from '@apps/runway/engine/chargedTo';
import { selectIsAutoPayReady } from '@apps/runway/store/selectors/autoPaySelectors';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import {
  selectAllAccounts,
  selectAllCards,
  selectBillPayments,
  selectBills,
  selectIsLinkHistory,
} from '@apps/runway/store/selectors/runwaySelectors';
import { isChargedToDeclined } from '@apps/runway/utils/chargedToDeclined';

const NO_HINTS: ChargedToHint[] = [];

const selectChargedToBills = createSelector(
  [
    selectBills,
    selectBillPayments,
    selectAllAccounts,
    (state: RootState) => state.runway.matchKeys,
  ],
  (bills, payments, accounts, matchKeys): ChargedToBill[] => {
    const openAccounts = accounts.filter(
      (account) => account.archivedAt === null,
    );
    return bills
      .filter(({ version }) => !isCardFeeBill(version.payload))
      .map(({ item, version }): ChargedToBill => {
        const { paidByCardId, accountId } = version.payload;
        const resolvedAccountId = resolvePayFromAccountId(
          accountId,
          openAccounts,
        );
        const getPlace = (): ChargedPlace | null => {
          if (paidByCardId) return { kind: 'card', id: paidByCardId };
          return resolvedAccountId
            ? { kind: 'account', id: resolvedAccountId }
            : null;
        };
        return {
          id: item.id,
          name: version.payload.name,
          merchantKeys: matchKeys[item.id] ?? [],
          place: getPlace(),
          isExplicit:
            (paidByCardId ?? null) !== null || (accountId ?? null) !== null,
          payments: (payments[item.id] ?? []).map((payment) => ({
            dueOn: payment.dueOn,
            payOn: payment.payOn,
            lowCents: payment.ranged
              ? payment.ranged.range.lowCents
              : payment.totalCents,
            highCents: payment.ranged
              ? payment.ranged.range.highCents
              : payment.totalCents,
          })),
        };
      });
  },
);

const selectAllHints = createSelector(
  [
    selectIsAutoPayReady,
    selectLevel,
    (state: RootState, today: number) => selectChargedToBills(state, today),
    (state: RootState) => state.runway.purchases,
    selectIsLinkHistory,
    selectAllCards,
    selectAllAccounts,
    (_state: RootState, today: number) => today,
  ],
  (
    isReady,
    level,
    bills,
    purchases,
    isLinkHistory,
    cards,
    accounts,
    today,
  ): ChargedToHint[] =>
    isReady && level === 'link'
      ? findChargedToHints({
          today,
          bills,
          purchases,
          isLinkHistory,
          isOpenPlace: (place) =>
            (place.kind === 'card' ? cards : accounts).some(
              (found) => found.id === place.id && found.archivedAt === null,
            ),
        })
      : NO_HINTS,
);

/** What the bills' recent bank charges suggest they are charged to, minus what the person declined on this device. Declines live on the device, so their version is passed in. */
export const selectChargedToHints = createSelector(
  [
    (state: RootState, today: number) => selectAllHints(state, today),
    (_state: RootState, _today: number, declines: number) => declines,
    (_state: RootState, _today: number, _declines: number, uid: string) => uid,
  ],
  (hints, _declines, uid): ChargedToHint[] => {
    const kept = hints.filter(
      (hint) => !isChargedToDeclined(uid, hint.billId, hint.place),
    );
    return kept.length === hints.length ? hints : kept;
  },
);

export const selectChargedToHint = (
  state: RootState,
  today: number,
  billId: string,
  declines: number,
  uid: string,
): ChargedToHint | null =>
  selectChargedToHints(state, today, declines, uid).find(
    (hint) => hint.billId === billId,
  ) ?? null;
