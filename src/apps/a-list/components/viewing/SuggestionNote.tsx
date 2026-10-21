import { formatCents } from '@/utils/moneyUtils';
import type { TicketSuggestion } from '@apps/a-list/utils/chips';
import { formatTaxRate } from '@apps/a-list/utils/tax';
import type { TicketDraft } from '@apps/a-list/utils/ticketDraft';

interface SuggestionNoteProps {
  suggestion: TicketSuggestion;
  draft: TicketDraft;
  theatreName: string | null;
}

/** Says which of the fee and tax came from the member's past tickets here, until they change it. */
function SuggestionNote({
  suggestion,
  draft,
  theatreName,
}: SuggestionNoteProps) {
  const learned = [
    suggestion.isFeeLearned && !draft.isFeeEdited
      ? `${formatCents(suggestion.feeCents)} fee`
      : null,
    suggestion.isTaxLearned && !draft.isTaxEdited && suggestion.taxRate !== null
      ? `${formatTaxRate(suggestion.taxRate)} tax`
      : null,
  ].filter((part): part is string => part !== null);

  if (!theatreName || learned.length === 0) {
    return null;
  }

  return (
    <p className='bg-secondary/60 rounded-2xl px-3 py-2 text-sm'>
      📍 Filled in your usual {learned.join(' and ')} at {theatreName}. Change
      anything that's different today.
    </p>
  );
}

export default SuggestionNote;
