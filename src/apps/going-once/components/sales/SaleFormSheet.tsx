import { useMemo, useState, type FormEvent } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { Button, Input, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { MapPin, StickyNote, Wallet } from 'lucide-react';

import DraftRestoredNotice from '@/components/DraftRestoredNotice';
import AddFieldChips, {
  RemovableField,
} from '@/components/forms/AddFieldChips';
import Field from '@/components/forms/Field';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import SuggestionChips from '@/components/SuggestionChips';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useFormDraft, useKeepFormDraft } from '@/hooks/useFormDraft';
import { useAppDispatch } from '@/store';
import {
  MAX_BUYER_NOTE_LENGTH,
  MAX_PICKUP_AREA_LENGTH,
  MAX_SALE_NAME_LENGTH,
  SALE_DETAIL_NOTES,
  SALE_NAME_SUGGESTIONS,
} from '@apps/going-once/constants';
import PaymentMethodsField from '@apps/going-once/components/sales/PaymentMethodsField';
import { startSale } from '@apps/going-once/store/actions/saleActions';

interface SaleFormSheetProps {
  isOpen: boolean;
  uid: string;
  onClose: () => void;
  onStarted: (saleId: string) => void;
}

const EXTRA_CHIPS = [
  {
    key: 'pickupArea',
    label: 'Pickup area',
    icon: <MapPin className='h-4 w-4' />,
  },
  {
    key: 'buyerNote',
    label: 'Note for buyers',
    icon: <StickyNote className='h-4 w-4' />,
  },
  {
    key: 'paymentMethods',
    label: 'Payment methods',
    icon: <Wallet className='h-4 w-4' />,
  },
];

const START_SALE_DRAFT_KEY = 'going-once:start-sale:new';

interface SaleDraft {
  name: string;
  pickupArea: string | null;
  buyerNote: string | null;
  paymentMethods: string[] | null;
}

const isTextOrNull = (value: unknown) =>
  value === null || typeof value === 'string';

const parseSaleDraft = (stored: unknown): SaleDraft | null => {
  if (typeof stored !== 'object' || stored === null) return null;
  const { name, pickupArea, buyerNote, paymentMethods } = stored as Record<
    string,
    unknown
  >;
  if (typeof name !== 'string') return null;
  if (!isTextOrNull(pickupArea) || !isTextOrNull(buyerNote)) return null;
  return {
    name,
    pickupArea: pickupArea as string | null,
    buyerNote: buyerNote as string | null,
    paymentMethods:
      Array.isArray(paymentMethods) &&
      paymentMethods.every((method) => typeof method === 'string')
        ? paymentMethods
        : null,
  };
};

/** Starts a sale: a name, and the pickup area and note for buyers as extras. */
function SaleFormSheet({
  isOpen,
  uid,
  onClose,
  onStarted,
}: SaleFormSheetProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const kept = useFormDraft({
    key: START_SALE_DRAFT_KEY,
    base: null,
    parse: parseSaleDraft,
  });
  const [name, setName] = useState(kept.restored?.name ?? '');
  const [pickupArea, setPickupArea] = useState<string | null>(
    kept.restored?.pickupArea ?? null,
  );
  const [buyerNote, setBuyerNote] = useState<string | null>(
    kept.restored?.buyerNote ?? null,
  );

  const [paymentMethods, setPaymentMethods] = useState<string[] | null>(
    kept.restored?.paymentMethods ?? null,
  );

  const isDirty =
    name.trim() !== '' ||
    (paymentMethods?.length ?? 0) > 0 ||
    (pickupArea?.trim() ?? '') !== '' ||
    (buyerNote?.trim() ?? '') !== '';
  const keptValue = useMemo<SaleDraft>(
    () => ({ name, pickupArea, buyerNote, paymentMethods }),
    [name, pickupArea, buyerNote, paymentMethods],
  );
  useKeepFormDraft({
    isRestored: kept.restored !== null,
    key: START_SALE_DRAFT_KEY,
    base: null,
    value: keptValue,
    isDirty,
  });
  const startOver = () => {
    setName('');
    setPickupArea(null);
    setBuyerNote(null);
    setPaymentMethods(null);
    kept.hideNotice();
  };
  const requestClose = useDiscardGuard({
    isDirty,
    onClose,
  });
  const canStart = name.trim() !== '';

  const revealExtra = (key: string) => {
    if (key === 'pickupArea') setPickupArea('');
    else if (key === 'paymentMethods') setPaymentMethods([]);
    else setBuyerNote('');
  };
  const isExtraHidden = (key: string) => {
    if (key === 'pickupArea') return pickupArea === null;
    if (key === 'paymentMethods') return paymentMethods === null;
    return buyerNote === null;
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canStart) return;
    const sale = startSale(
      dispatch,
      {
        uid,
        name,
        pickupArea,
        buyerNote,
        paymentMethods: paymentMethods ?? [],
      },
      (message) => addToast({ title: message, type: 'error' }),
    );
    onClose();
    onStarted(sale.id);
  };

  return (
    <FormSheet isOpen={isOpen} onClose={requestClose} title='Start a sale'>
      <form className='space-y-4' onSubmit={handleSubmit}>
        {kept.isNoticeShown && (
          <DraftRestoredNotice
            onStartOver={startOver}
            onDismiss={kept.hideNotice}
          />
        )}
        <div className='space-y-3'>
          <Field label='Name'>
            {() => (
              <Input
                variant='outline'
                placeholder='Fall clear-out'
                maxLength={MAX_SALE_NAME_LENGTH}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>
          <p className='text-muted-foreground text-xs text-pretty'>
            {SALE_DETAIL_NOTES.name}
          </p>
          <SuggestionChips
            label='Ideas'
            suggestions={SALE_NAME_SUGGESTIONS}
            isDisabled={name.trim() !== ''}
            onPick={setName}
          />
        </div>

        {pickupArea !== null && (
          <RemovableField
            label='Pickup area'
            removeLabel='Remove pickup area'
            onRemove={() => setPickupArea(null)}
          >
            <Input
              variant='outline'
              aria-label='Pickup area'
              placeholder='Capitol Hill, Seattle'
              maxLength={MAX_PICKUP_AREA_LENGTH}
              value={pickupArea}
              onChange={(event) => setPickupArea(event.target.value)}
            />
            <p className='text-muted-foreground text-xs'>
              An area, never your address. Buyers see this.
            </p>
          </RemovableField>
        )}

        {buyerNote !== null && (
          <RemovableField
            label='Note for buyers'
            removeLabel='Remove note for buyers'
            onRemove={() => setBuyerNote(null)}
          >
            <Textarea
              variant='outline'
              aria-label='Note for buyers'
              rows={3}
              placeholder='Evenings and weekends.'
              maxLength={MAX_BUYER_NOTE_LENGTH}
              value={buyerNote}
              onChange={(event) => setBuyerNote(event.target.value)}
            />
            <p className='text-muted-foreground text-xs'>Buyers see this.</p>
          </RemovableField>
        )}

        {paymentMethods !== null && (
          <RemovableField
            label='Payment methods'
            removeLabel='Remove payment methods'
            onRemove={() => setPaymentMethods(null)}
          >
            <PaymentMethodsField
              values={paymentMethods}
              onChange={setPaymentMethods}
            />
          </RemovableField>
        )}

        <AddFieldChips
          chips={EXTRA_CHIPS.filter((chip) => isExtraHidden(chip.key))}
          onAdd={revealExtra}
        />

        <ModalFooterActions
          note={canStart ? undefined : 'Give your sale a name to start it.'}
          cancelAction={
            <Button
              type='button'
              variant='secondary'
              rounded='full'
              onClick={requestClose}
            >
              Cancel
            </Button>
          }
          rightActions={
            <Button type='submit' rounded='full' disabled={!canStart}>
              Start
            </Button>
          }
        />
      </form>
    </FormSheet>
  );
}

export default SaleFormSheet;
