import {
  CONTAINER_PLACE_EMOJIS,
  CONTAINER_PLACE_LABELS,
} from '@apps/pinch/constants';
import {
  getStockDueText,
  getStockParts,
  type StockSummary,
} from '@apps/pinch/utils/containers';
import { formatServings } from '@apps/pinch/utils/recipeFormat';

interface StockLineProps {
  summary: StockSummary | undefined;
}

/** What is put away of a recipe or meal, only where it is above zero: "🧊 2 servings · ❄️ 6 servings", with the nearest eat-by once it is close. */
function StockLine({ summary }: StockLineProps) {
  if (!summary) {
    return null;
  }

  const parts = getStockParts(summary);
  const due = getStockDueText(summary);
  if (parts.length === 0) {
    return null;
  }

  return (
    <span className='text-muted-foreground flex flex-wrap gap-x-2 text-xs font-normal'>
      {parts.map((part) => (
        <span key={part.place} className='whitespace-nowrap'>
          <span aria-hidden='true'>{CONTAINER_PLACE_EMOJIS[part.place]}</span>{' '}
          {formatServings(part.servings)}
          <span className='sr-only'>
            {' '}
            in the {CONTAINER_PLACE_LABELS[part.place].toLowerCase()}
          </span>
        </span>
      ))}
      {due && <span className='whitespace-nowrap'>{due}</span>}
    </span>
  );
}

export default StockLine;
