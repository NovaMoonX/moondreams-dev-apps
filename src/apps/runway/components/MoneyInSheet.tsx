import { useMemo, useState } from 'react';
import { ArrowLeftRight, CalendarPlus, Undo2 } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import FormSheet from '@/components/FormSheet';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAppSelector } from '@/store';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import DepositOffer from '@apps/runway/components/DepositOffer';
import LeaveOutRow from '@apps/runway/components/LeaveOutRow';
import PairOffer from '@apps/runway/components/PairOffer';
import SheetHead from '@apps/runway/components/SheetHead';
import {
  DEPOSIT_WORDS,
  NEEDS_HOME_WORDS,
  PAIR_WORDS,
} from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { findRefundOriginal, isRefundLike } from '@apps/runway/engine/matching';
import IncomeForm from '@apps/runway/forms/IncomeForm';
import PurchaseForm from '@apps/runway/forms/PurchaseForm';
import {
  selectItemLooks,
  selectListedDays,
  selectLostDeposits,
  selectLostPairs,
  selectMoneyInAsks,
  selectOnItsWay,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenPurchase } from '@apps/runway/types';
import {
  describeEnvelopes,
  getPurchaseTitle,
} from '@apps/runway/utils/purchaseText';

interface MoneyInSheetProps {
  purchase: OpenPurchase;
  onClose: () => void;
}

/** One deposit or refund from the bank: what Runway can still ask about it (a card payment, a refund of a purchase that went to an envelope, a move, a pay day), or that it is already in Free to Spend, with a way to plan it as a one-time pay or put a refund back in an envelope. */
function MoneyInSheet({ purchase, onClose }: MoneyInSheetProps) {
  const today = todayAsUtcDate();
  const cards = useAppSelector((state) => state.runway.cards);
  const accounts = useAppSelector((state) => state.runway.accounts);
  const looks = useAppSelector(selectItemLooks);
  const purchases = useAppSelector((state) => state.runway.purchases);
  const refundOriginal = useMemo(
    () => findRefundOriginal(purchase, purchases),
    [purchase, purchases],
  );
  const isAsked = useAppSelector((state) =>
    selectMoneyInAsks(state, today).has(purchase.id),
  );
  const isLostDeposit = useAppSelector((state) =>
    selectLostDeposits(state, today).some((entry) => entry.id === purchase.id),
  );
  const isLostPair = useAppSelector((state) =>
    selectLostPairs(state).some((entry) => entry.id === purchase.id),
  );
  const isOnItsWay = useAppSelector((state) =>
    selectOnItsWay(state).some((entry) => entry.purchase.id === purchase.id),
  );
  const linkedDay = useAppSelector((state) => {
    if (purchase.incomeDayId === null) return null;
    const listed = selectListedDays(state, today);
    return (
      [...listed.open, ...listed.confirmed].find(
        (day) => day.dayKey === purchase.incomeDayId,
      ) ?? null
    );
  });
  const [form, setForm] = useState<'refund' | 'refundOf' | 'pay' | null>(null);
  const isWaiting = purchase.needsHome || isLostDeposit || isLostPair;

  if (form === 'refund' || form === 'refundOf') {
    return (
      <PurchaseForm
        isOpen
        editing={purchase}
        presetOriginalId={
          form === 'refundOf' ? (refundOriginal?.id ?? null) : null
        }
        isCountedAlready={isWaiting}
        onClose={onClose}
        onCancel={() => setForm(null)}
      />
    );
  }
  if (form === 'pay') {
    return (
      <IncomeForm
        isOpen
        title='Expected'
        defaultFrequency='once'
        startsOn={purchase.date}
        onClose={onClose}
        onCancel={() => setForm(null)}
      />
    );
  }

  const title =
    purchase.label?.trim() ||
    purchase.merchant?.trim() ||
    NEEDS_HOME_WORDS.moneyIn;
  const sourceName =
    cards.find((card) => card.id === purchase.paidByCardId)?.name ??
    accounts.find((account) => account.id === purchase.accountId)?.name ??
    NEEDS_HOME_WORDS.fromBank;
  const isOnCard = (purchase.paidByCardId ?? null) !== null;
  const isPosted = purchase.status === 'posted';
  const nameOf = (id: string) => looks.get(id)?.name ?? 'An envelope';
  const isRefundAsk = isWaiting && isAsked && refundOriginal !== null;
  const isQuietRefund =
    isRefundLike(purchase) &&
    purchase.lines.every((line) => line.envelopeId === null);

  const refundChoices = refundOriginal !== null && (
    <ActionGroup isRoomy>
      <ActionRow
        isGrouped
        isRoomy
        hasChevron
        icon={<Undo2 />}
        label={NEEDS_HOME_WORDS.refundOfRow(
          getPurchaseTitle(refundOriginal, nameOf),
          formatDateOrdinalUTC(refundOriginal.date),
        )}
        subtitle={NEEDS_HOME_WORDS.refundOfRowSub(
          describeEnvelopes(
            refundOriginal.lines.filter((line) => line.cents > 0),
            nameOf,
          ),
        )}
        onClick={() => setForm('refundOf')}
      />
      <ActionRow
        isGrouped
        isRoomy
        hasChevron
        icon={<ArrowLeftRight />}
        label={NEEDS_HOME_WORDS.refundOtherRow}
        subtitle={NEEDS_HOME_WORDS.refundOtherRowSub}
        onClick={() => setForm('refund')}
      />
      <LeaveOutRow purchase={purchase} onDone={onClose} isKeepFree />
    </ActionGroup>
  );
  const putBackChoices = (
    <ActionGroup isRoomy>
      <ActionRow
        isGrouped
        isRoomy
        hasChevron
        icon={<ArrowLeftRight />}
        label={NEEDS_HOME_WORDS.putBackRow}
        subtitle={NEEDS_HOME_WORDS.putBackRowSub}
        onClick={() => setForm('refund')}
      />
      {isOnCard && (
        <LeaveOutRow
          purchase={purchase}
          onDone={onClose}
          label={NEEDS_HOME_WORDS.notRefundRow}
          subtitle={NEEDS_HOME_WORDS.notRefundRowSub}
        />
      )}
    </ActionGroup>
  );

  const cardChoices = (
    <ActionGroup isRoomy>
      <ActionRow
        isGrouped
        isRoomy
        icon={<ArrowLeftRight />}
        label={NEEDS_HOME_WORDS.refundRow}
        subtitle={NEEDS_HOME_WORDS.refundRowSub}
        onClick={() => setForm('refund')}
      />
      <LeaveOutRow purchase={purchase} onDone={onClose} isKeepFree />
      <LeaveOutRow
        purchase={purchase}
        onDone={onClose}
        label={NEEDS_HOME_WORDS.unseenRow}
        subtitle={NEEDS_HOME_WORDS.unseenRowSub}
      />
    </ActionGroup>
  );
  const accountChoices = (
    <>
      <DepositOffer deposit={purchase} onDone={onClose} />
      <ActionGroup isRoomy>
        <ActionRow
          isGrouped
          isRoomy
          hasChevron
          icon={<CalendarPlus />}
          label={NEEDS_HOME_WORDS.unlistedPay}
          subtitle={NEEDS_HOME_WORDS.thisWasPaySub}
          onClick={() => setForm('pay')}
        />
        <LeaveOutRow purchase={purchase} onDone={onClose} />
      </ActionGroup>
    </>
  );
  const payRow = (
    <ActionGroup isRoomy>
      <ActionRow
        isGrouped
        isRoomy
        hasChevron
        icon={<CalendarPlus />}
        label={NEEDS_HOME_WORDS.thisWasPay}
        subtitle={NEEDS_HOME_WORDS.thisWasPaySub}
        onClick={() => setForm('pay')}
      />
    </ActionGroup>
  );

  const getBody = () => {
    if (isOnItsWay) {
      return (
        <p className='text-muted-foreground text-sm'>
          {NEEDS_HOME_WORDS.onItsWaySheet}
        </p>
      );
    }
    if (isRefundAsk) {
      return isPosted ? (
        <PairOffer purchase={purchase} onDone={onClose}>
          {refundChoices}
        </PairOffer>
      ) : (
        refundChoices
      );
    }
    if (isWaiting && isOnCard && isAsked) {
      return isPosted ? (
        <PairOffer purchase={purchase} onDone={onClose}>
          {cardChoices}
        </PairOffer>
      ) : (
        cardChoices
      );
    }
    if (isWaiting && isAsked && isPosted) {
      return (
        <PairOffer purchase={purchase} onDone={onClose}>
          {accountChoices}
        </PairOffer>
      );
    }
    if (linkedDay !== null) {
      return (
        <p className='text-muted-foreground text-sm'>
          {NEEDS_HOME_WORDS.linkedTo(
            formatDateOrdinalUTC(linkedDay.arrivedOn ?? linkedDay.on),
          )}
        </p>
      );
    }
    if (isQuietRefund) {
      return (
        <>
          <p className='text-muted-foreground text-sm'>
            {NEEDS_HOME_WORDS.refundAlreadyIn}
          </p>
          {isWaiting && putBackChoices}
        </>
      );
    }
    return (
      <>
        <p className='text-muted-foreground text-sm'>
          {NEEDS_HOME_WORDS.alreadyIn}
        </p>
        {purchase.needsHome && !isOnCard && payRow}
      </>
    );
  };

  return (
    <FormSheet
      isOpen
      isDrawerWhenShort
      onClose={onClose}
      title={title}
      actions={<ValuesEyeButton />}
    >
      <div className='space-y-4 pb-4'>
        <SheetHead
          label={
            isRefundLike(purchase) || refundOriginal !== null
              ? NEEDS_HOME_WORDS.refundLabel
              : NEEDS_HOME_WORDS.moneyIn
          }
          figure={`+${formatCents(-purchase.amountCents)}`}
          fact={`${formatDateOrdinalUTC(purchase.date)} · ${sourceName}`}
        />
        {isLostDeposit && isAsked && (
          <p className='text-muted-foreground text-sm'>{DEPOSIT_WORDS.lost}</p>
        )}
        {isLostPair && isAsked && (
          <p className='text-muted-foreground text-sm'>{PAIR_WORDS.lost}</p>
        )}
        {getBody()}
      </div>
    </FormSheet>
  );
}

export default MoneyInSheet;
