import { useAppSelector } from '@/store';
import { selectShoppingOpenCount } from '@apps/pinch/store/selectors';

/** Reads the count itself, so a tick on the list re-renders this badge and not the nav around it. */
function ShoppingTabBadge() {
  const count = useAppSelector(selectShoppingOpenCount);

  if (count === 0) {
    return null;
  }

  return (
    <span
      className='bg-primary text-primary-foreground absolute -top-1.5 left-full -ml-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold'
      aria-hidden='true'
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

export default ShoppingTabBadge;
