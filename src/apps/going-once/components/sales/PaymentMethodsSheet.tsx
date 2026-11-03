import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import FormSheet from '@/components/FormSheet';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import ModalFooterActions from '@/components/ModalFooterActions';
import PaymentMethodsField from '@apps/going-once/components/sales/PaymentMethodsField';
import { updateSalePaymentMethods } from '@apps/going-once/store/actions/saleActions';

const SAVE_FAILED = "That didn't save. Check your connection and try again.";
/** An offline write never settles, so after this long it counts as kept on the device and the sheet closes. */
const QUEUED_AFTER_MS = 2000;

interface PaymentMethodsSheetProps {
  saleId: string;
  value: string[];
  onClose: () => void;
}

/** The sale's ways to pay in their own sheet: written on Done, and only when they changed. */
function PaymentMethodsSheet({
  saleId,
  value,
  onClose,
}: PaymentMethodsSheetProps) {
  const { addToast } = useToast();
  const [draft, setDraft] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isChanged = draft.join('\u0000') !== value.join('\u0000');
  const requestClose = useDiscardGuard({
    isDirty: isChanged,
    isBusy: isSaving,
    onClose,
    title: 'Discard these changes?',
    message: 'Buyers keep seeing the ways to pay you had before.',
  });

  const done = async () => {
    if (isSaving) return;
    if (!isChanged) {
      onClose();
      return;
    }
    setIsSaving(true);
    setError(null);
    const write = updateSalePaymentMethods(saleId, draft);
    const outcome = await Promise.race([
      write.then(
        () => 'saved' as const,
        () => 'failed' as const,
      ),
      new Promise<'queued'>((resolve) =>
        window.setTimeout(() => resolve('queued'), QUEUED_AFTER_MS),
      ),
    ]);
    if (outcome === 'failed') {
      setIsSaving(false);
      setError(SAVE_FAILED);
      return;
    }
    if (outcome === 'queued')
      write.catch(() =>
        addToast({
          title: "Payment methods didn't save",
          description: 'Open it and try again.',
          type: 'error',
        }),
      );
    onClose();
  };

  return (
    <FormSheet isOpen onClose={requestClose} title='Payment methods'>
      <div className='pb-4'>
        <PaymentMethodsField values={draft} onChange={setDraft} />
      </div>
      <ModalFooterActions
        note={error}
        rightActions={
          <Button type='button' disabled={isSaving} onClick={() => void done()}>
            Done
          </Button>
        }
      />
    </FormSheet>
  );
}

export default PaymentMethodsSheet;
