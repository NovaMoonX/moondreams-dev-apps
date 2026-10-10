import { Form, FormFactories } from '@moondreamsdev/dreamer-ui/components';

import MoneyInput from '@/components/MoneyInput';
import { useAppSelector } from '@/store';
import PremiumSavingsHelp from '@apps/a-list/components/shared/PremiumSavingsHelp';
import FeeChips from '@apps/a-list/components/viewing/FeeChips';
import { AMC_FORMAT_LABELS, AMC_FORMATS } from '@apps/a-list/constants';
import {
  selectFeeChips,
  selectTaxRateChips,
} from '@apps/a-list/store/selectors';
import {
  centsToInputValue,
  formatCents,
  parseMoneyToCents,
} from '@apps/a-list/utils/money';
import { getItemizedTaxCents } from '@apps/a-list/utils/tax';
import {
  evaluateTicketDraft,
  type TicketDraft,
} from '@apps/a-list/utils/ticketDraft';

const { custom, select } = FormFactories;

interface TicketFieldsProps {
  draft: TicketDraft;
  onChange: (draft: TicketDraft) => void;
}

/** The ticket's fields, shared by "Mark paid" and the add form's "+ Add ticket details": the same three amounts AMC itemizes. */
function TicketFields({ draft, onChange }: TicketFieldsProps) {
  const feeChips = useAppSelector(selectFeeChips);
  const { defaultRate } = useAppSelector(selectTaxRateChips);
  const { ticket, errors } = evaluateTicketDraft(draft);
  const isPremium = draft.format !== 'STANDARD';
  const priceCents = parseMoneyToCents(draft.price);
  const standardCents = parseMoneyToCents(draft.standardPrice);
  const hasNoUpcharge =
    isPremium &&
    priceCents !== null &&
    standardCents !== null &&
    priceCents <= standardCents;
  const estimatedTax =
    priceCents !== null && defaultRate !== null
      ? centsToInputValue(getItemizedTaxCents(priceCents, defaultRate))
      : '1.39';

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
      name: 'price',
      label: 'Ticket price',
      renderComponent: (props) => (
        <MoneyInput
          ariaLabel='Ticket price'
          placeholder='18.50'
          value={(props.value as string | undefined) ?? ''}
          errorMessage={errors.price}
          onChange={(value) => props.onValueChange(value)}
        />
      ),
    }),
    ...(isPremium
      ? [
          custom({
            name: 'standardPrice',
            label: 'Standard price for this showing',
            renderComponent: (props) => (
              <div className='space-y-1.5'>
                <MoneyInput
                  ariaLabel='Standard price for this showing'
                  placeholder='14.00'
                  value={(props.value as string | undefined) ?? ''}
                  errorMessage={errors.standardPrice}
                  onChange={(value) => props.onValueChange(value)}
                />
                <p className='text-muted-foreground text-xs'>
                  We compare it with your premium ticket to see the upcharge you
                  skipped.{' '}
                  <PremiumSavingsHelp linkLabel='How premium savings work' />
                </p>
                {hasNoUpcharge && (
                  <p className='border-accent-foreground/40 bg-accent text-foreground flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-xs font-medium'>
                    <span
                      className='bg-background grid size-7 shrink-0 place-items-center rounded-full text-sm shadow-sm'
                      aria-hidden='true'
                    >
                      💡
                    </span>
                    <span className='min-w-0 self-center'>
                      This premium ticket costs the same as or less than
                      Standard, so it adds $0 to your premium savings.
                    </span>
                  </p>
                )}
              </div>
            ),
          }),
        ]
      : []),
    custom({
      name: 'fee',
      label: 'Convenience fee',
      description: 'Members pay none, so enter what a non-member would have.',
      renderComponent: (props) => (
        <div className='space-y-2'>
          <MoneyInput
            ariaLabel='Convenience fee'
            placeholder='1.50'
            value={(props.value as string | undefined) ?? ''}
            errorMessage={errors.fee}
            onChange={(value) => props.onValueChange(value)}
          />
          <FeeChips
            value={(props.value as string | undefined) ?? ''}
            chips={feeChips}
            onPick={(cents) => props.onValueChange(centsToInputValue(cents))}
          />
        </div>
      ),
    }),
    custom({
      name: 'tax',
      label: 'Tax',
      renderComponent: (props) => (
        <MoneyInput
          ariaLabel='Tax'
          placeholder={estimatedTax}
          value={(props.value as string | undefined) ?? ''}
          errorMessage={errors.tax}
          onChange={(value) => props.onValueChange(value)}
        />
      ),
    }),
  ];

  return (
    <div className='space-y-3'>
      <Form
        key={isPremium ? 'premium' : 'standard'}
        id='a-list-ticket'
        form={fields}
        initialData={draft}
        columns={1}
        spacing='normal'
        onDataChange={(data) =>
          onChange({ ...draft, ...(data as Partial<TicketDraft>) })
        }
      />
      {ticket && (
        <p className='text-muted-foreground text-sm'>
          A non-member would have paid{' '}
          <strong className='text-foreground'>
            {formatCents(ticket.totalCents)}
          </strong>
          .
        </p>
      )}
    </div>
  );
}

export default TicketFields;
