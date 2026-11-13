import { useState, type ReactNode } from 'react';
import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import DetailSheet from '@/components/DetailSheet';
import SensitiveValue from '@/components/SensitiveValue';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { RECURRING_SHEET_WORDS } from '@apps/runway/constants';
import {
  getStreamKeys,
  isSameStreamAmount,
  type RecurringHint,
} from '@apps/runway/engine/recurring';
import BillForm from '@apps/runway/forms/BillForm';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { learnBillMerchant } from '@apps/runway/store/actions/autoPayActions';
import {
  selectAllAccounts,
  selectAllCards,
} from '@apps/runway/store/selectors/runwaySelectors';
import { getPlaceNamer } from '@apps/runway/utils/chargedToText';
import {
  describeStreamHow,
  getStreamBill,
  getStreamName,
} from '@apps/runway/utils/recurringText';
import {
  dismissRecurring,
  undismissRecurring,
} from '@apps/runway/utils/recurringDismissed';

interface RecurringStreamSheetProps {
  hint: Extract<RecurringHint, { kind: 'newBill' }> | null;
  onFormChange: (isOpen: boolean) => void;
  onClose: () => void;
}

const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className='flex items-start justify-between gap-3 p-3 text-sm'>
    <dt className='text-muted-foreground'>{label}</dt>
    <dd className='min-w-0 text-right font-medium break-words'>{children}</dd>
  </div>
);

/** A repeating charge the bank found that is not a bill yet: what it looks like, and "Add it as a bill" opens the new-bill form filled from it. */
function RecurringStreamSheet({
  hint,
  onFormChange,
  onClose,
}: RecurringStreamSheetProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const cards = useAppSelector(selectAllCards);
  const accounts = useAppSelector(selectAllAccounts);
  const [added, setAdded] = useState<typeof hint>(null);
  const current = added ?? hint;
  if (!current) return null;
  const { stream, place } = current;
  const name = getStreamName(stream);
  const amount = isSameStreamAmount(stream)
    ? formatCents(stream.lastCents)
    : RECURRING_SHEET_WORDS.about(formatCents(stream.averageCents));

  if (added) {
    return (
      <BillForm
        isOpen
        title={name}
        onClose={onClose}
        onCancel={() => {
          setAdded(null);
          onFormChange(false);
        }}
        fromCharge={{
          initial: getStreamBill(stream, place),
          onCreated: (billId) => {
            if (!user) return;
            void getRunwayEncryption(user.uid)
              .then((encryption) =>
                learnBillMerchant(
                  user.uid,
                  encryption,
                  billId,
                  getStreamKeys(stream),
                ),
              )
              .catch(console.error);
          },
        }}
      />
    );
  }

  return (
    <DetailSheet
      isOpen
      onClose={onClose}
      title={name}
      actions={<ValuesEyeButton />}
      footer={
        <div className='space-y-2 p-4'>
          <Button
            type='button'
            className='w-full'
            onClick={() => {
              setAdded(current);
              onFormChange(true);
            }}
          >
            {RECURRING_SHEET_WORDS.addBill}
          </Button>
          <Button
            type='button'
            variant='tertiary'
            className='w-full'
            onClick={() => {
              if (user) {
                const { uid } = user;
                dismissRecurring(uid, current.key);
                addToast({
                  title: RECURRING_SHEET_WORDS.wontSuggest(name),
                  type: 'success',
                  action: {
                    label: RECURRING_SHEET_WORDS.undo,
                    onClick: () => undismissRecurring(uid, current.key),
                  },
                });
              }
              onClose();
            }}
          >
            {RECURRING_SHEET_WORDS.notABill}
          </Button>
        </div>
      }
    >
      <div className='space-y-3'>
        <p className='text-muted-foreground text-sm'>
          {RECURRING_SHEET_WORDS.addBillSub}
        </p>
        <dl className='border-border divide-border bg-card divide-y rounded-2xl border'>
          <Fact label={RECURRING_SHEET_WORDS.amount}>
            <SensitiveValue>{amount}</SensitiveValue>
          </Fact>
          <Fact label={RECURRING_SHEET_WORDS.howOften}>
            {describeStreamHow(stream)}
          </Fact>
          <Fact label={RECURRING_SHEET_WORDS.lastCharged}>
            {formatDateOrdinalUTC(stream.lastOn)}
          </Fact>
          {stream.nextOn !== null && (
            <Fact label={RECURRING_SHEET_WORDS.nextExpected}>
              {formatDateOrdinalUTC(stream.nextOn)}
            </Fact>
          )}
          <Fact label={RECURRING_SHEET_WORDS.chargedTo}>
            {getPlaceNamer(cards, accounts)(place)}
          </Fact>
        </dl>
      </div>
    </DetailSheet>
  );
}

export default RecurringStreamSheet;
