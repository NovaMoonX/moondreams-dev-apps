import { formatCents } from '@/utils/moneyUtils';
import { ENVELOPE_FIGURE_WORD } from '@apps/runway/constants';
import ItemBadge from '@apps/runway/components/ItemBadge';

interface EnvelopeTileProps {
  name: string;
  emoji: string | null;
  cents: number;
}

/** An envelope on Home: its name and what is assigned to it. */
function EnvelopeTile({ name, emoji, cents }: EnvelopeTileProps) {
  return (
    <li className='flex items-start gap-3 p-3'>
      <ItemBadge name={name} emoji={emoji} />
      <p className='line-clamp-2 min-w-0 flex-1 pt-2 font-medium break-words'>
        {name}
      </p>
      <div className='shrink-0 text-right'>
        <p className='pt-0.5 font-semibold whitespace-nowrap tabular-nums'>
          {formatCents(cents)}
        </p>
        <p className='text-muted-foreground text-xs'>{ENVELOPE_FIGURE_WORD}</p>
      </div>
    </li>
  );
}

export default EnvelopeTile;
