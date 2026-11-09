import { useRef, useState } from 'react';
import { SearchX } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import EmptyCard from '@/components/EmptyCard';
import FormSheet from '@/components/FormSheet';
import SearchInput from '@/components/SearchInput';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAppSelector } from '@/store';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { ActionTitle } from '@apps/runway/components/ActionSection';
import ItemRow from '@apps/runway/components/ItemRow';
import {
  AUTO_PAY_WORDS,
  RUNWAY_SEARCH_THRESHOLD,
} from '@apps/runway/constants';
import {
  useChargeCandidates,
  usePickCharge,
  useSnoozeCharge,
} from '@apps/runway/hooks/useAutoPay';
import {
  selectAccounts,
  selectAllCards,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { DateOnly, OpenPurchase } from '@apps/runway/types';
import { getCardName } from '@apps/runway/utils/cardText';

interface ChargePickerViewProps {
  billId: string;
  billName: string;
  dueOn: DateOnly;
  /** Called once a charge is matched or the question is put off. */
  onDone: () => void;
}

/** The charges near a payment's due day, to pick the one that was it. */
function ChargePickerView({
  billId,
  billName,
  dueOn,
  onDone,
}: ChargePickerViewProps) {
  const { candidates, payment } = useChargeCandidates(billId, dueOn);
  const cards = useAppSelector(selectAllCards);
  const accounts = useAppSelector(selectAccounts);
  const pickCharge = usePickCharge();
  const snooze = useSnoozeCharge();
  const [query, setQuery] = useState('');
  const isPicking = useRef(false);
  const due = formatDateOrdinalUTC(dueOn);

  const getName = (purchase: OpenPurchase) =>
    purchase.label?.trim() ||
    purchase.merchant?.trim() ||
    AUTO_PAY_WORDS.noMerchant;
  const getSource = (purchase: OpenPurchase) => {
    const card = cards.find((entry) => entry.id === purchase.paidByCardId);
    return card
      ? getCardName(card, cards)
      : (accounts.find((entry) => entry.id === purchase.accountId)?.name ??
          null);
  };
  const isOneSource =
    new Set(candidates.map((purchase) => getSource(purchase))).size <= 1;
  const getMatchWord = (purchase: OpenPurchase) => {
    if (!payment) return null;
    if (payment.lowCents === payment.highCents) {
      return purchase.amountCents === payment.lowCents
        ? AUTO_PAY_WORDS.pickSameAmount
        : null;
    }
    return purchase.amountCents >= payment.lowCents &&
      purchase.amountCents <= payment.highCents
      ? AUTO_PAY_WORDS.pickInRange
      : null;
  };
  const needle = query.trim().toLowerCase();
  const shown =
    needle === ''
      ? candidates
      : candidates.filter((purchase) =>
          `${getName(purchase)} ${getSource(purchase) ?? ''}`
            .toLowerCase()
            .includes(needle),
        );

  const choose = async (purchase: OpenPurchase) => {
    if (isPicking.current) return;
    isPicking.current = true;
    const isWritten = await pickCharge(purchase, billId, billName, dueOn);
    isPicking.current = false;
    if (isWritten) onDone();
  };

  return (
    <div className='flex flex-col gap-4'>
      <ActionTitle>{AUTO_PAY_WORDS.pickTitle(billName, due)}</ActionTitle>
      {candidates.length >= RUNWAY_SEARCH_THRESHOLD && (
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={AUTO_PAY_WORDS.pickSearch}
        />
      )}
      <Button
        type='button'
        variant='secondary'
        onClick={() => {
          snooze(billId, dueOn);
          onDone();
        }}
      >
        {AUTO_PAY_WORDS.notHereYet}
      </Button>
      {candidates.length === 0 ? (
        <EmptyCard icon={<SearchX className='size-5' />}>
          {AUTO_PAY_WORDS.pickEmpty(due)}
        </EmptyCard>
      ) : (
        <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
          {shown.map((purchase) => (
            <ItemRow
              key={purchase.id}
              name={getName(purchase)}
              detail={AUTO_PAY_WORDS.pickRow(
                formatDateOrdinalUTC(purchase.date),
                isOneSource ? null : getSource(purchase),
              )}
              figure={formatCents(purchase.amountCents)}
              figureWord={getMatchWord(purchase)}
              isAction
              onOpen={() => void choose(purchase)}
              ariaLabel={`${getName(purchase)}. Pick this charge`}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface ChargePickerSheetProps extends Omit<ChargePickerViewProps, 'onDone'> {
  onClose: () => void;
}

/** The picker on its own, for Home's "To check" row. */
export function ChargePickerSheet({
  onClose,
  ...rest
}: ChargePickerSheetProps) {
  return (
    <FormSheet
      isOpen
      isDrawerWhenShort
      onClose={onClose}
      title={rest.billName}
      actions={<ValuesEyeButton />}
    >
      <ChargePickerView {...rest} onDone={onClose} />
    </FormSheet>
  );
}

export default ChargePickerView;
