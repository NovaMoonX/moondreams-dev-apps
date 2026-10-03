import MoneyInput from '@/components/MoneyInput';
import type { CostStepValues } from '@apps/a-list/utils/costStep';
import { evaluateCostStep } from '@apps/a-list/utils/costStep';
import { formatCents } from '@apps/a-list/utils/money';
import { formatTaxRate } from '@apps/a-list/utils/tax';

interface TaxStepProps {
  values: CostStepValues;
  todayDay: number;
  onChange: (values: CostStepValues) => void;
}

function TaxStep({ values, todayDay, onChange }: TaxStepProps) {
  const { errors, taxRate, costCents } = evaluateCostStep(values, todayDay);
  const hasTaxRate = taxRate !== null && !errors.billTotal;

  return (
    <div className='space-y-5 text-center'>
      <div className='space-y-2'>
        <p className='text-5xl' aria-hidden='true'>
          🧾
        </p>
        <h3 className='text-xl font-semibold'>What's the total on your bill?</h3>
        <p className='text-muted-foreground text-sm'>
          With tax included. We'll use it to work out your tax rate and suggest
          it on your tickets. Not handy? You can skip this.
        </p>
        {costCents !== null && (
          <p className='text-sm'>
            Your plan: <strong>{formatCents(costCents)}</strong> a month before
            tax
          </p>
        )}
      </div>
      <div className='mx-auto max-w-xs text-left'>
        <MoneyInput
          autoFocus
          ariaLabel='Total on your bill, with tax'
          placeholder='27.94'
          className='text-lg'
          value={values.billTotal}
          errorMessage={errors.billTotal}
          onChange={(billTotal) => onChange({ ...values, billTotal })}
        />
      </div>
      {hasTaxRate && (
        <p className='text-sm'>
          That works out to about <strong>{formatTaxRate(taxRate)}</strong> tax.
        </p>
      )}
    </div>
  );
}

export default TaxStep;
