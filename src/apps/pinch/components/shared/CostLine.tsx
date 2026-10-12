import { formatCents } from '@/utils/moneyUtils';
import type { RecipeCost } from '@apps/pinch/types';
import { countLeftOutIngredients, formatLeftOut } from '@apps/pinch/utils/gaps';

interface CostLineProps {
  cost: RecipeCost;
}

function CostLine({ cost }: CostLineProps) {
  if (cost.totalCents === null) {
    return <>No prices yet</>;
  }

  const leftOut = countLeftOutIngredients(cost.leftOut) > 0;

  return (
    <>
      {formatCents(Math.round(cost.totalCents))}
      {' · '}
      <span className='whitespace-nowrap'>
        {formatCents(Math.round(cost.perServingCents ?? 0))} / serving
      </span>
      {leftOut && ` · ${formatLeftOut(cost.leftOut)}`}
    </>
  );
}

export default CostLine;
