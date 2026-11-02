import { useState, type FormEvent } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { Button, Input, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { MapPin, StickyNote } from 'lucide-react';

import AddFieldChips, {
  RemovableField,
} from '@/components/forms/AddFieldChips';
import Field from '@/components/forms/Field';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import SuggestionChips from '@/components/SuggestionChips';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useAppDispatch } from '@/store';
import {
  MAX_BUYER_NOTE_LENGTH,
  MAX_PICKUP_AREA_LENGTH,
  MAX_SALE_NAME_LENGTH,
  SALE_NAME_SUGGESTIONS,
} from '@apps/going-once/constants';
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
];

/** Starts a sale: a name, and the pickup area and note for buyers as extras. */
function SaleFormSheet({
  isOpen,
  uid,
  onClose,
  onStarted,
}: SaleFormSheetProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const [name, setName] = useState('');
  const [pickupArea, setPickupArea] = useState<string | null>(null);
  const [buyerNote, setBuyerNote] = useState<string | null>(null);

  const isDirty =
    name.trim() !== '' ||
    (pickupArea?.trim() ?? '') !== '' ||
    (buyerNote?.trim() ?? '') !== '';
  const requestClose = useDiscardGuard({
    isDirty,
    onClose,
  });
  const canStart = name.trim() !== '';

  const revealExtra = (key: string) =>
    key === 'pickupArea' ? setPickupArea('') : setBuyerNote('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canStart) return;
    const sale = startSale(
      dispatch,
      { uid, name, pickupArea, buyerNote },
      (message) => addToast({ title: message, type: 'error' }),
    );
    onClose();
    onStarted(sale.id);
  };

  return (
    <FormSheet isOpen={isOpen} onClose={requestClose} title='Start a sale'>
      <form
        className='space-y-4'
        onSubmit={(event) => void handleSubmit(event)}
      >
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
              placeholder='Evenings and weekends. Cash or Venmo.'
              maxLength={MAX_BUYER_NOTE_LENGTH}
              value={buyerNote}
              onChange={(event) => setBuyerNote(event.target.value)}
            />
            <p className='text-muted-foreground text-xs'>Buyers see this.</p>
          </RemovableField>
        )}

        <AddFieldChips
          chips={EXTRA_CHIPS.filter((chip) =>
            chip.key === 'pickupArea'
              ? pickupArea === null
              : buyerNote === null,
          )}
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
