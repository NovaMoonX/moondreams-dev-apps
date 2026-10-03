import {
  Button,
  Form,
  FormFactories,
} from '@moondreamsdev/dreamer-ui/components';

import { useAppSelector } from '@/store';
import MoneyInput from '@/components/MoneyInput';
import FeeChips from '@apps/a-list/components/viewing/FeeChips';
import TaxChips from '@apps/a-list/components/viewing/TaxChips';
import { AMC_FORMAT_LABELS, AMC_FORMATS } from '@apps/a-list/constants';
import {
  selectFeeChips,
  selectTaxRateChips,
} from '@apps/a-list/store/selectors';
import type { TicketEntryMode } from '@apps/a-list/types';
import { formatCents } from '@apps/a-list/utils/money';
import {
  evaluateTicketDraft,
  type FeeValue,
  type RateValue,
  type TicketDraft,
} from '@apps/a-list/utils/ticketDraft';

const { custom, select } = FormFactories;

const MODES: { value: TicketEntryMode; label: string }[] = [
  { value: 'ITEMIZED', label: 'Itemized' },
  { value: 'ALL_IN', label: 'All-in total' },
];

interface TicketFieldsProps {
  draft: TicketDraft;
  onChange: (draft: TicketDraft) => void;
}

/** The ticket's fields, shared by "Mark paid" and the add form's "+ Add ticket details". */
function TicketFields({ draft, onChange }: TicketFieldsProps) {
  const feeChips = useAppSelector(selectFeeChips);
  const { chips: rateChips } = useAppSelector(selectTaxRateChips);
  const { ticket, errors } = evaluateTicketDraft(draft);
  const isAllIn = draft.entryMode === 'ALL_IN';
  const isPremium = draft.format !== 'STANDARD';

  const fields = [
    select({
      name: 'format',
      label: 'Format',
      options: AMC_FORMATS.map((format) => ({
        value: format,
        label: AMC_FORMAT_LABELS[format],
      })),
    }),
    custom({
      name: 'amount',
      label: isAllIn ? 'Total with tax and fee' : 'Ticket price (before tax)',
      renderComponent: (props) => (
        <MoneyInput
          ariaLabel={
            isAllIn ? 'Total with tax and fee' : 'Ticket price before tax'
          }
          placeholder={isAllIn ? '21.39' : '18.50'}
          value={(props.value as string | undefined) ?? ''}
          errorMessage={errors.amount}
          onChange={(value) => props.onValueChange(value)}
        />
      ),
    }),
    ...(isPremium
      ? [
          custom({
            name: 'standardPrice',
            label: 'Standard price for this showing (before tax)',
            renderComponent: (props) => (
              <MoneyInput
                ariaLabel='Standard price for this showing'
                placeholder='14.00'
                value={(props.value as string | undefined) ?? ''}
                errorMessage={errors.standardPrice}
                onChange={(value) => props.onValueChange(value)}
              />
            ),
          }),
        ]
      : []),
    custom({
      name: 'fee',
      label: 'Convenience fee you skipped',
      renderComponent: (props) => (
        <FeeChips
          value={props.value as FeeValue}
          chips={feeChips}
          error={errors.fee}
          onChange={(value) => props.onValueChange(value)}
        />
      ),
    }),
    custom({
      name: 'rate',
      label: 'Tax rate',
      renderComponent: (props) => (
        <TaxChips
          value={props.value as RateValue}
          chips={rateChips}
          error={errors.rate}
          onChange={(value) => props.onValueChange(value)}
        />
      ),
    }),
  ];

  const getSummary = () => {
    if (!ticket) return null;
    const parts = `${formatCents(ticket.priceCents)} + ${formatCents(ticket.feeAvoidedCents)} fee + ${formatCents(ticket.taxCents)} tax`;
    return isAllIn
      ? `Estimated split · ${parts}`
      : `What a non-member would pay · ${formatCents(ticket.totalCents)} (${parts})`;
  };

  const summary = getSummary();

  return (
    <div className='space-y-3'>
      <div
        className='bg-muted/50 grid grid-cols-2 gap-1 rounded-lg p-1'
        role='group'
        aria-label='How to enter the ticket'
      >
        {MODES.map((mode) => (
          <Button
            key={mode.value}
            type='button'
            size='sm'
            variant={draft.entryMode === mode.value ? 'primary' : 'tertiary'}
            aria-pressed={draft.entryMode === mode.value}
            onClick={() =>
              mode.value !== draft.entryMode &&
              onChange({ ...draft, entryMode: mode.value, amount: '' })
            }
          >
            {mode.label}
          </Button>
        ))}
      </div>
      <Form
        key={`${draft.entryMode}-${isPremium ? 'premium' : 'standard'}`}
        id='a-list-ticket'
        form={fields}
        initialData={draft}
        columns={1}
        spacing='normal'
        onDataChange={(data) =>
          onChange({ ...draft, ...(data as Partial<TicketDraft>) })
        }
      />
      {summary && <p className='text-muted-foreground text-sm'>{summary}</p>}
      {isAllIn && isPremium && (
        <p className='text-muted-foreground text-xs'>
          Premium savings use the price before tax, so they're most accurate
          when a premium ticket is itemized.
        </p>
      )}
    </div>
  );
}

export default TicketFields;
