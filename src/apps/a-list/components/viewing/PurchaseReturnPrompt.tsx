import { useState } from 'react';

import { Button, Drawer, Modal } from '@moondreamsdev/dreamer-ui/components';

import MoneyInput from '@/components/MoneyInput';
import { useMediaQuery } from '@/hooks/useMediaQuery';

import { formatDate } from '@/utils/formatUtils';
import PosterCover from '@apps/a-list/components/shared/PosterCover';
import FeeChips from '@apps/a-list/components/viewing/FeeChips';
import SuggestionNote from '@apps/a-list/components/viewing/SuggestionNote';
import TicketFields from '@apps/a-list/components/viewing/TicketFields';
import { useAppSelector } from '@/store';
import { useTicketSuggestion } from '@apps/a-list/hooks/useTicketSuggestion';
import {
  selectFeeChips,
  selectTaxRateChips,
} from '@apps/a-list/store/selectors';
import {
  centsToInputValue,
  formatCents,
  parseMoneyToCents,
} from '@/utils/moneyUtils';
import { getItemizedTaxCents } from '@apps/a-list/utils/tax';
import type { Ticket, Viewing } from '@apps/a-list/types';
import {
  describePurchase,
  getPurchaseTicketDraft,
} from '@apps/a-list/utils/purchase';
import { formatShowtimeForTheatre } from '@apps/a-list/utils/theatreTime';
import {
  evaluateTicketDraft,
  resolveTicketDraft,
  type TicketDraft,
} from '@apps/a-list/utils/ticketDraft';

interface PurchaseReturnPromptProps {
  viewing: Viewing;
  isSaving: boolean;
  onLater: () => void;
  onDidNotBuy: () => void;
  onSave: (ticket: Ticket) => void;
}

/** Welcomes the member back from AMC and asks only for what the API can't tell us: the fee and the tax. */
function PurchaseReturnPrompt({
  viewing,
  isSaving,
  onLater,
  onDidNotBuy,
  onSave,
}: PurchaseReturnPromptProps) {
  const feeChips = useAppSelector(selectFeeChips);
  const { defaultRate } = useAppSelector(selectTaxRateChips);
  const { purchase } = viewing;
  const [isChangingPlan, setIsChangingPlan] = useState(false);
  const isPhone = useMediaQuery().isBelow('sm');
  const [draft, setDraft] = useState<TicketDraft | null>(() =>
    purchase ? getPurchaseTicketDraft(purchase) : null,
  );
  const suggestion = useTicketSuggestion(
    viewing.theatre?.theatreId ?? null,
    draft?.format ?? 'STANDARD',
  );

  if (!purchase || !draft) {
    return null;
  }

  const result = evaluateTicketDraft(draft, suggestion);
  const shown = resolveTicketDraft(draft, suggestion);
  const priceCents = parseMoneyToCents(draft.price);
  const estimatedTax =
    priceCents !== null && defaultRate !== null
      ? centsToInputValue(getItemizedTaxCents(priceCents, defaultRate))
      : '1.39';

  const content = (
    <div className='space-y-4'>
      <p className='text-lg leading-snug font-semibold'>
        Did you get your ticket to {viewing.movie.title}?
      </p>
      <div className='flex gap-3'>
        <span className='h-20 w-14 shrink-0 overflow-hidden rounded-xl shadow-md'>
          <PosterCover
            title={viewing.movie.title}
            posterUrl={viewing.movie.posterUrl}
          />
        </span>
        <div className='min-w-0 space-y-0.5 self-center'>
          <p className='text-sm font-medium'>
            {formatDate(viewing.showtimeAt)} ·{' '}
            {formatShowtimeForTheatre(
              viewing.showtimeAt,
              viewing.theatre?.timeZone ?? null,
            )}
          </p>
          {viewing.theatre && (
            <p className='text-muted-foreground text-sm'>
              📍 {viewing.theatre.name}
            </p>
          )}
        </div>
      </div>
      {isChangingPlan ? (
        <TicketFields
          draft={draft}
          onChange={setDraft}
          theatre={viewing.theatre ?? null}
        />
      ) : (
        <div className='space-y-3'>
          <p className='bg-secondary/60 flex items-center justify-between gap-2 rounded-2xl px-3 py-2 text-sm'>
            <span>
              🎟️ {describePurchase(purchase)}
              {purchase.standardPriceCents !== null && (
                <span className='text-muted-foreground'>
                  {' '}
                  (standard {formatCents(purchase.standardPriceCents)})
                </span>
              )}
            </span>
            <Button
              type='button'
              variant='link'
              size='sm'
              className='h-auto shrink-0 p-0 text-xs'
              onClick={() => setIsChangingPlan(true)}
            >
              Change
            </Button>
          </p>
          <SuggestionNote
            suggestion={suggestion}
            draft={draft}
            theatreName={viewing.theatre?.name ?? null}
            hasTax={shown.tax.trim() !== ''}
          />
          <p className='text-muted-foreground text-sm'>
            {suggestion.isFeeLearned || suggestion.isTaxLearned
              ? 'Check the convenience fee and the tax against your checkout.'
              : 'Add the convenience fee and the tax from your checkout.'}{' '}
            If a line wasn't there or showed $0, enter 0.
          </p>
          <div className='space-y-1.5'>
            <p className='text-sm font-medium'>Convenience fee</p>
            <MoneyInput
              ariaLabel='Convenience fee'
              placeholder='1.50'
              value={shown.fee}
              errorMessage={result.errors.fee}
              onChange={(value) =>
                setDraft({ ...draft, fee: value, isFeeEdited: true })
              }
            />
            <FeeChips
              value={shown.fee}
              chips={feeChips}
              onPick={(cents) =>
                setDraft({
                  ...draft,
                  fee: centsToInputValue(cents),
                  isFeeEdited: true,
                })
              }
            />
          </div>
          <div className='space-y-1.5'>
            <p className='text-sm font-medium'>Tax</p>
            <MoneyInput
              ariaLabel='Tax'
              placeholder={estimatedTax}
              value={shown.tax}
              errorMessage={result.errors.tax}
              onChange={(value) =>
                setDraft({ ...draft, tax: value, isTaxEdited: true })
              }
            />
          </div>
        </div>
      )}
      <div className='space-y-2'>
        {!result.isValid && (
          <p className='text-muted-foreground text-center text-sm'>
            {shown.tax.trim() === ''
              ? 'Add the tax to save your ticket.'
              : 'Check the amounts above to save your ticket.'}
          </p>
        )}
        <Button
          type='button'
          size='lg'
          rounded='full'
          className='w-full'
          loading={isSaving}
          disabled={!result.isValid || isSaving}
          onClick={() => result.ticket && onSave(result.ticket)}
        >
          🎟️ Save my ticket
        </Button>
        <div className='grid grid-cols-2 gap-2'>
          <Button
            type='button'
            variant='secondary'
            rounded='full'
            disabled={isSaving}
            onClick={onLater}
          >
            Ask me later
          </Button>
          <Button
            type='button'
            variant='secondary'
            rounded='full'
            disabled={isSaving}
            onClick={onDidNotBuy}
          >
            I changed my mind
          </Button>
        </div>
        <p className='text-muted-foreground text-center text-xs'>
          Ask me later brings this back next time you come back to the app.
          Changing your mind clears the plan and stops the questions.
        </p>
      </div>
    </div>
  );

  return isPhone ? (
    <Drawer isOpen onClose={onLater} title='Welcome back'>
      {content}
    </Drawer>
  ) : (
    <Modal isOpen onClose={onLater} title='Welcome back'>
      {content}
    </Modal>
  );
}

export default PurchaseReturnPrompt;
