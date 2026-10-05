import MoneyInput from '@/components/MoneyInput';
import type { CostStepValues } from '@apps/a-list/utils/costStep';
import { evaluateCostStep } from '@apps/a-list/utils/costStep';

interface CostStepProps {
  values: CostStepValues;
  todayDay: number;
  onChange: (values: CostStepValues) => void;
}

function CostStep({ values, todayDay, onChange }: CostStepProps) {
  const { errors } = evaluateCostStep(values, todayDay);

  return (
    <div className='space-y-5 text-center'>
      <div className='space-y-2'>
        <p className='text-5xl' aria-hidden='true'>
          🎟️
        </p>
        <h3 className='text-xl font-semibold'>
          What does your membership cost each month?
        </h3>
        <p className='text-muted-foreground text-sm'>
          The price of your plan before any taxes. Check your AMC receipt or
          account page if you're not sure.
        </p>
      </div>
      <div className='mx-auto max-w-xs text-left'>
        <MoneyInput
          autoFocus
          ariaLabel='Monthly cost before tax'
          placeholder='25.99'
          className='text-lg'
          value={values.cost}
          errorMessage={errors.cost}
          onChange={(cost) => onChange({ ...values, cost })}
        />
      </div>
    </div>
  );
}

export default CostStep;
