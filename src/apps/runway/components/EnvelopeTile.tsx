import { useAppSelector } from '@/store';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import { describeEnvelopeFigure } from '@apps/runway/utils/purchaseText';
import ItemBadge from '@apps/runway/components/ItemBadge';

interface EnvelopeTileProps {
  name: string;
  emoji: string | null;
  cents: number;
}

/** An envelope on Home: its name and its figure, which the level calls assigned, left or over. */
function EnvelopeTile({ name, emoji, cents }: EnvelopeTileProps) {
  const { value, word } = describeEnvelopeFigure(
    useAppSelector(selectLevel),
    cents,
  );
  return (
    <li className='flex items-start gap-3 p-3'>
      <ItemBadge name={name} emoji={emoji} />
      <p className='line-clamp-2 min-w-0 flex-1 pt-2 font-medium break-words'>
        {name}
      </p>
      <div className='shrink-0 text-right'>
        <p className='pt-0.5 font-semibold whitespace-nowrap tabular-nums'>
          {value}
        </p>
        <p className='text-muted-foreground text-xs'>{word}</p>
      </div>
    </li>
  );
}

export default EnvelopeTile;
