import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import DeleteIconButton from '@/components/DeleteIconButton';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAppSelector } from '@/store';
import TicketFields from '@apps/a-list/components/viewing/TicketFields';
import { selectTaxRateChips } from '@apps/a-list/store/selectors';
import type { Ticket } from '@apps/a-list/types';
import {
  evaluateTicketDraft,
  getInitialTicketDraft,
  type TicketDraft,
} from '@apps/a-list/utils/ticketDraft';

interface TicketFormProps {
  ticket: Ticket | null;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (ticket: Ticket) => void;
  onClear: () => void;
}

function TicketForm({
  ticket,
  isSaving,
  onCancel,
  onSave,
  onClear,
}: TicketFormProps) {
  const { defaultRate } = useAppSelector(selectTaxRateChips);
  const [draft, setDraft] = useState<TicketDraft>(() =>
    getInitialTicketDraft(ticket, defaultRate),
  );
  const result = evaluateTicketDraft(draft);

  return (
    <div className='space-y-4'>
      <p className='text-muted-foreground text-sm'>
        Members pay no convenience fee, so record what a non-member would have
        paid.
      </p>
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
