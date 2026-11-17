import { useState } from 'react';
import { Send } from 'lucide-react';

import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import { useAuth } from '@/hooks/useAuth';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { CARD_WORDS, STARTED_PAYMENT_WORDS } from '@apps/runway/constants';
import {
  STARTED_PAYMENT_WINDOW_DAYS,
  type StartedPaymentState,
} from '@apps/runway/engine/cards';
import { DAY_MS } from '@apps/runway/engine/dates';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { removeStartedPayment } from '@apps/runway/store/actions/cardActions';
import type { DateOnly } from '@apps/runway/types';

/** Halfway through the wait, a payment the bank hasn't shown says when Runway stops waiting for it. */
const LATE_AFTER_DAYS = STARTED_PAYMENT_WINDOW_DAYS / 2;

interface StartedPaymentRowsProps {
  waiting: readonly StartedPaymentState[];
  bankName: string;
  today: DateOnly;
}

/** A card's payments started at the bank that it doesn't show yet, one row each; a tap offers to remove one the person didn't send after all. */
function StartedPaymentRows({
  waiting,
  bankName,
  today,
}: StartedPaymentRowsProps) {
  const { user } = useAuth();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const mask = useMaskedText();
  const [removingId, setRemovingId] = useState<string | null>(null);

  if (waiting.length === 0) return null;

  const describe = ({ payment, hasLeft }: StartedPaymentState) => {
    const day = formatDateOrdinalUTC(payment.startedOn);
    if (hasLeft) return STARTED_PAYMENT_WORDS.rowLeft(day);
    return today - payment.startedOn > LATE_AFTER_DAYS * DAY_MS
      ? STARTED_PAYMENT_WORDS.rowLate(
          day,
          formatDateOrdinalUTC(
            payment.startedOn + STARTED_PAYMENT_WINDOW_DAYS * DAY_MS,
          ),
        )
      : STARTED_PAYMENT_WORDS.rowStarted(day);
  };

  const remove = async ({ payment }: StartedPaymentState) => {
    if (!user) return;
    const isConfirmed = await confirm({
      title: STARTED_PAYMENT_WORDS.removeTitle,
      message: mask(
        STARTED_PAYMENT_WORDS.removeText(
          formatCents(payment.amountCents),
          bankName,
        ),
      ),
      confirmText: STARTED_PAYMENT_WORDS.removeConfirm,
      destructive: true,
    });
    if (!isConfirmed) return;
    setRemovingId(payment.id);
    try {
      await removeStartedPayment(user.uid, payment.id);
      addToast({ title: STARTED_PAYMENT_WORDS.removed, type: 'success' });
    } catch (error) {
      addToast({
        title: STARTED_PAYMENT_WORDS.removeFailed,
        description: getErrorMessage(error, CARD_WORDS.failed),
        type: 'error',
      });
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <ActionGroup>
      {waiting.map((entry) => (
        <ActionRow
          key={entry.payment.id}
          isGrouped
          hasChevron
          icon={<Send />}
          label={mask(
            STARTED_PAYMENT_WORDS.rowTitle(
              formatCents(entry.payment.amountCents),
            ),
          )}
          subtitle={describe(entry)}
          isDisabled={removingId === entry.payment.id}
          onClick={() => void remove(entry)}
        />
      ))}
    </ActionGroup>
  );
}

export default StartedPaymentRows;
