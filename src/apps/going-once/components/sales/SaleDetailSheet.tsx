import { useState } from 'react';

import { Button, Input, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import {
  MAX_BUYER_NOTE_LENGTH,
  MAX_PICKUP_AREA_LENGTH,
  MAX_SALE_NAME_LENGTH,
  SALE_DETAILS,
} from '@apps/going-once/constants';
import type { SaleDetailField } from '@apps/going-once/types';
import { updateSaleDetail } from '@apps/going-once/store/actions/saleActions';

const SAVE_FAILED = "That didn't save. Check your connection and try again.";
/** An offline write never settles, so after this long it counts as kept on the phone and the sheet closes. */
const QUEUED_AFTER_MS = 2000;

interface SaleDetailSheetProps {
  saleId: string;
  field: SaleDetailField;
  value: string | null;
  onClose: () => void;
}

/** One of the sale's details in its own sheet: written on Done, and only when it changed. */
function SaleDetailSheet({
  saleId,
  field,
  value,
  onClose,
}: SaleDetailSheetProps) {
  const { addToast } = useToast();
  const { label, hint } = SALE_DETAILS[field];
  const [draft, setDraft] = useState(value ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = draft.trim();
  const isNameMissing = field === 'name' && trimmed === '';

  const done = async () => {
    if (isSaving || isNameMissing) return;
    const next = trimmed === '' ? null : trimmed;
    if (next === value) {
      onClose();
      return;
    }
    setIsSaving(true);
    setError(null);
    const write = updateSaleDetail(saleId, field, next);
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
          title: `${label} didn't save`,
          description: 'Open it and try again.',
          type: 'error',
        }),
      );
    onClose();
  };

  return (
    <FormSheet
      isOpen
      onClose={() => (isNameMissing ? onClose() : void done())}
      title={label}
    >
      <form
        className='space-y-4 pb-4'
        onSubmit={(event) => {
          event.preventDefault();
          void done();
        }}
      >
        {field === 'buyerNote' ? (
          <Textarea
            variant='outline'
            aria-label={label}
            rows={4}
            placeholder='Evenings and weekends. Cash or Venmo.'
            maxLength={MAX_BUYER_NOTE_LENGTH}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        ) : (
          <Input
            variant='outline'
            aria-label={label}
            placeholder={
              field === 'name' ? 'Fall clear-out' : 'Capitol Hill, Seattle'
            }
            maxLength={
              field === 'name' ? MAX_SALE_NAME_LENGTH : MAX_PICKUP_AREA_LENGTH
            }
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        )}
        {hint && <p className='text-muted-foreground text-xs'>{hint}</p>}
      </form>
      <ModalFooterActions
        note={
          error ?? (isNameMissing ? 'Give your sale a name to keep it.' : null)
        }
        rightActions={
          <Button
            type='button'
            disabled={isSaving || isNameMissing}
            onClick={() => void done()}
          >
            Done
          </Button>
        }
      />
    </FormSheet>
  );
}

export default SaleDetailSheet;
