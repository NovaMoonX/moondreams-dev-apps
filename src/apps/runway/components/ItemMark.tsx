import { useAppSelector } from '@/store';
import { selectItemLooks } from '@apps/runway/store/selectors/runwaySelectors';

interface ItemMarkProps {
  itemId: string;
  name: string;
}

/** An item's emoji at an action row's icon size, or the first letter of its name when it has none. */
function ItemMark({ itemId, name }: ItemMarkProps) {
  const emoji = useAppSelector(
    (state) => selectItemLooks(state).get(itemId)?.emoji ?? null,
  );

  return (
    <span className='text-sm leading-none font-semibold'>
      {emoji ?? Array.from(name.trim())[0]?.toUpperCase() ?? ''}
    </span>
  );
}

export default ItemMark;
