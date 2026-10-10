import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import DeleteIconButton from '@/components/DeleteIconButton';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAppSelector } from '@/store';
import TicketFields from '@apps/a-list/components/viewing/TicketFields';
import { selectFeeChips } from '@apps/a-list/store/selectors';
import type { PurchasePlan, Ticket } from '@apps/a-list/types';
import { getPurchaseTicketDraft } from '@apps/a-list/utils/purchase';
import {
  evaluateTicketDraft,
  getInitialTicketDraft,
  type TicketDraft,
} from '@apps/a-list/utils/ticketDraft';

interface TicketFormProps {
  ticket: Ticket | null;
  /** Prefills the format and prices of a new ticket from the showing the member picked on AMC. */
  purchase?: PurchasePlan | null;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (ticket: Ticket) => void;
  onClear: () => void;
}

function TicketForm({
  ticket,
  purchase = null,
  isSaving,
  onCancel,
  onSave,
  onClear,
}: TicketFormProps) {
  const feeChips = useAppSelector(selectFeeChips);
  const [draft, setDraft] = useState<TicketDraft>(() =>
    ticket || !purchase
      ? getInitialTicketDraft(ticket, feeChips[1] ?? 0)
      : getPurchaseTicketDraft(purchase, feeChips[1] ?? 0),
  );
  const result = evaluateTicketDraft(draft);

  return (
    <div className='space-y-4'>
      <TicketFields draft={draft} onChange={setDraft} />
      <ModalFooterActions
        leftActions={
          ticket && (
            <DeleteIconButton
              label='Clear ticket'
              disabled={isSaving}
              onClick={onClear}
            />
          )
        }
        rightActions={
          <>
            <Button
              type='button'
              variant='secondary'
              disabled={isSaving}
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              type='button'
              loading={isSaving}
              disabled={!result.isValid || isSaving}
              onClick={() => result.ticket && onSave(result.ticket)}
            >
              Save
            </Button>
          </>
        }
      />
    </div>
  );
}

export default TicketForm;
