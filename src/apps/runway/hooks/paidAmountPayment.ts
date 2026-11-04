import { useAppSelector } from '@/store';
import type { BillPayment } from '@apps/runway/engine/demands';
import { getHeldFor } from '@apps/runway/hooks/useBillPaid';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import type { Cents, MoneyRange } from '@apps/runway/types';
import { getBillCardName } from '@apps/runway/utils/cardText';

/** What the sheet needs to know about the payment being marked, whatever it is a payment of. */
export interface PaidAmountPayment {
  /** What the sheet calls it in its title and notices. */
  name: string;
  /** What the money left over stays with: the bill itself, or the event a cost belongs to. */
  keeperName: string;
  /** The usual range of a payment that varies; null for an exact one. */
  range: MoneyRange | null;
  /** The most money set aside for it that a payment could use. */
  heldMostCents: Cents;
  /** What a payment of that amount would use from what is set aside; the rest comes out of Free to Spend. */
  getHeldCents: (amountCents: Cents) => Cents;
  /** Already marked paid, possibly from another screen while the sheet is open. */
  isPaid: boolean;
  /** The card it is charged to; null when it is paid in cash. */
  cardName: string | null;
}

/** The card a bill's payment would be charged to, only while tracking, since cards are part of it. */
export const useBillCardName = (billId: string, dueOn: number | null) =>
  useAppSelector((state) =>
    dueOn !== null && selectLevel(state) === 'track'
      ? getBillCardName(
          state.runway.versions,
          state.runway.cards,
          billId,
          dueOn,
        )
      : null,
  );

/** A bill's payment as the sheet reads it. */
export const toBillAmountPayment = (
  billName: string,
  payment: BillPayment,
  cardName: string | null,
): PaidAmountPayment => ({
  name: billName === '' ? 'this bill' : billName,
  keeperName: billName === '' ? 'this bill' : billName,
  range: payment.ranged?.range ?? null,
  heldMostCents: payment.heldMostCents,
  getHeldCents: (amountCents) => getHeldFor(payment, amountCents),
  isPaid: payment.paid !== null,
  cardName,
});
