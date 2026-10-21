import { formatCents } from '@/utils/moneyUtils';
import type { TicketSuggestion } from '@apps/a-list/utils/chips';
import type { TicketDraft } from '@apps/a-list/utils/ticketDraft';

interface SuggestionNoteProps {
  suggestion: TicketSuggestion;
  draft: TicketDraft;
  theatreName: string | null;
  /** The tax field has an amount; with no price yet there is nothing to say was filled in. */
  hasTax: boolean;
}

/** Says which of the fee and tax came from the member's past tickets here, until they change it. */
function SuggestionNote({
  suggestion,
  draft,
  theatreName,
  hasTax,
}: SuggestionNoteProps) {
  const learned = [
    suggestion.isFeeLearned && !draft.isFeeEdited
      ? `${formatCents(suggestion.feeCents)} fee`
      : null,
    suggestion.isTaxLearned && !draft.isTaxEdited && hasTax ? 'tax' : null,
  ].filter((part): part is string => part !== null);

  if (!theatreName || learned.length === 0) {
    return null;
  }

  return (
    <p className='bg-secondary/60 rounded-2xl px-3 py-2 text-sm'>
      🧾 Filled in your usual {learned.join(' and ')} at {theatreName}. Change
      either if today's different.
    </p>
  );
}

export default SuggestionNote;
