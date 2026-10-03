import {
  Button,
  Form,
  FormFactories,
} from '@moondreamsdev/dreamer-ui/components';

import { createDateInputField } from '@/utils/formFactoryHelpers';
import MoneyInput from '@apps/a-list/components/shared/MoneyInput';
import {
  evaluateCostStep,
  type CostStepValues,
} from '@apps/a-list/utils/costStep';
import { formatTaxRate } from '@apps/a-list/utils/tax';

interface CostStepProps {
  values: CostStepValues;
  todayDay: number;
  onChange: (values: CostStepValues) => void;
}

const { custom } = FormFactories;

function CostStep({ values, todayDay, onChange }: CostStepProps) {
  const { errors, taxRate } = evaluateCostStep(values, todayDay);

  const billTotalError = errors.billTotal;
  const costError = errors.cost;
  const fields = [
    custom({
      name: 'cost',
      label: 'Monthly cost before tax',
      renderComponent: (props) => (
        <MoneyInput
          ariaLabel='Monthly cost before tax'
          placeholder='25.99'
          value={(props.value as string | undefined) ?? ''}
          errorMessage={costError}
          onChange={(value) => props.onValueChange(value)}
        />
      ),
    }),
    ...(values.showBillTotal
      ? [
          custom({
            name: 'billTotal',
            label: 'Total on your bill, with tax',
            renderComponent: (props) => (
              <MoneyInput
                ariaLabel='Total on your bill, with tax'
                placeholder='27.94'
                value={(props.value as string | undefined) ?? ''}
                errorMessage={billTotalError}
                onChange={(value) => props.onValueChange(value)}
              />
            ),
          }),
        ]
      : []),
    createDateInputField({
      name: 'startDate',
      label: 'When did your membership start?',
      variant: 'outline',
    }),
  ];

  return (
    <div className='space-y-3'>
      <Form
        key={values.showBillTotal ? 'with-bill' : 'no-bill'}
        id='a-list-setup-cost'
        form={fields}
        initialData={values}
        columns={1}
        spacing='normal'
        onDataChange={(data) =>
          onChange({ ...values, ...(data as Partial<CostStepValues>) })
        }
      />
      {errors.startDate && (
        <p className='text-destructive text-sm'>{errors.startDate}</p>
      )}
      {values.showBillTotal ? (
        <div className='flex items-start justify-between gap-3'>
          <p className='text-muted-foreground text-sm'>
            {taxRate !== null && !errors.billTotal
              ? `That works out to about ${formatTaxRate(taxRate)} tax. We'll suggest it on your tickets.`
              : 'Add the total from your bill and we’ll work out your tax rate.'}
          </p>
          <Button
            type='button'
            variant='link'
            size='sm'
            className='shrink-0'
            onClick={() =>
              onChange({ ...values, billTotal: '', showBillTotal: false })
            }
          >
            Remove total
          </Button>
        </div>
      ) : (
        <Button
          type='button'
          variant='link'
          size='sm'
          className='px-0'
          onClick={() => onChange({ ...values, showBillTotal: true })}
        >
          + Add the total on your bill
        </Button>
      )}
    </div>
  );
}

export default CostStep;
