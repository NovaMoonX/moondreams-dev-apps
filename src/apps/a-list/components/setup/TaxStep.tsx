import MoneyInput from '@/components/MoneyInput';
import type { CostStepValues } from '@apps/a-list/utils/costStep';
import { evaluateCostStep } from '@apps/a-list/utils/costStep';
import { formatTaxRate } from '@apps/a-list/utils/tax';

interface TaxStepProps {
  values: CostStepValues;
  todayDay: number;
  onChange: (values: CostStepValues) => void;
}

function TaxStep({ values, todayDay, onChange }: TaxStepProps) {
  const { errors, taxRate } = evaluateCostStep(values, todayDay);
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
        <p className='bg-accent text-accent-foreground mx-auto w-fit rounded-full px-4 py-1.5 text-sm font-medium'>
          That's about {formatTaxRate(taxRate)} tax 🎉
        </p>
      )}
    </div>
  );
}

export default TaxStep;
