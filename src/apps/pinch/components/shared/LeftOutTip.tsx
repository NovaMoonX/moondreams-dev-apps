import HelpTip from '@/components/HelpTip';
import type { Gap } from '@apps/pinch/types';
import { countLeftOutIngredients } from '@apps/pinch/utils/gaps';

interface LeftOutTipProps {
  leftOut: Gap[];
  /** One sentence on where the missing prices are added. */
  fix: string;
}

const ingredients = (count: number) =>
  `${count} ${count === 1 ? 'ingredient' : 'ingredients'}`;

/** The warning beside a cost: what it leaves out, telling a missing price from a size that can't be compared, and where to fix it. */
function LeftOutTip({ leftOut, fix }: LeftOutTipProps) {
  const noPrice = countLeftOutIngredients(
    leftOut.filter((gap) => gap.kind === 'NO_PRODUCT'),
  );
  const noSize = countLeftOutIngredients(
    leftOut.filter((gap) => gap.kind === 'NOT_COMPARABLE'),
  );

  const getWhat = () => {
    if (noSize === 0) return `${ingredients(noPrice)} with no price yet`;
    const sizes = `whose amount can't be compared with the package size`;
    if (noPrice === 0) return `${ingredients(noSize)} ${sizes}`;
    return `${ingredients(noPrice)} with no price yet and ${noSize} ${sizes}`;
  };

  return (
    <HelpTip variant='warning' title="What's left out" placement='bottom'>
      <p>
        This leaves out {getWhat()}. {fix}
      </p>
    </HelpTip>
  );
}

export default LeftOutTip;
