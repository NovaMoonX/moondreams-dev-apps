import { formatCents, parseMoneyToCents } from '@/utils/moneyUtils';
import type { TicketSuggestion } from '@apps/a-list/utils/chips';
import { getItemizedTaxCents } from '@apps/a-list/utils/tax';
import type { TicketDraft } from '@apps/a-list/utils/ticketDraft';

interface SuggestionNoteProps {
  suggestion: TicketSuggestion;
  draft: TicketDraft;
  theatreName: string | null;
  /** The tax as shown; it was filled from this theater only when it is the learned rate on the price. */
  shownTax: string;
  /** The tax chips are showing, and they speak for the tax. */
  hasTaxChoice: boolean;
}

/** Says which of the fee and tax came from the member's past tickets here, until they change it. */
function SuggestionNote({
  suggestion,
  draft,
  theatreName,
  shownTax,
  hasTaxChoice,
}: SuggestionNoteProps) {
  const priceCents = parseMoneyToCents(draft.price);
  const isTaxFromHere =
    suggestion.taxRate !== null &&
    priceCents !== null &&
    parseMoneyToCents(shownTax) ===
      getItemizedTaxCents(priceCents, suggestion.taxRate);
  const learned = [
    suggestion.isFeeLearned && !draft.isFeeEdited
      ? `${formatCents(suggestion.feeCents)} fee`
      : null,
    suggestion.isTaxLearned &&
    !draft.isTaxEdited &&
    !hasTaxChoice &&
    isTaxFromHere
      ? 'tax'
      : null,
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
