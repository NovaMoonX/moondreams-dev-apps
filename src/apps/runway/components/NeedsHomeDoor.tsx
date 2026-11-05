import { useAppSelector } from '@/store';
import ItemBadge from '@apps/runway/components/ItemBadge';
import ItemRow from '@apps/runway/components/ItemRow';
import { NEEDS_HOME_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { selectNeedsHome } from '@apps/runway/store/selectors/runwaySelectors';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';

/** Home's way into Needs a home, counting every charge and deposit it holds; drawn only while something waits, so a plan with no bank link never sees it. */
function NeedsHomeDoor() {
  const today = todayAsUtcDate();
  const count = useAppSelector((state) => {
    const { spending, moneyIn } = selectNeedsHome(state, today);
    return spending.length + moneyIn.length;
  });
  const { openView } = useRunwayUrlState();
  if (count === 0) return null;
  return (
    <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
      <ItemRow
        name={NEEDS_HOME_WORDS.title}
        leading={<ItemBadge name={NEEDS_HOME_WORDS.title} emoji='🏠' />}
        detail={NEEDS_HOME_WORDS.homeSub}
        figure={String(count)}
        isPrivate={false}
        ariaLabel={`${NEEDS_HOME_WORDS.title}, ${NEEDS_HOME_WORDS.homeSub}. Open`}
        onOpen={() => openView('needsHome')}
      />
    </ul>
  );
}

export default NeedsHomeDoor;
