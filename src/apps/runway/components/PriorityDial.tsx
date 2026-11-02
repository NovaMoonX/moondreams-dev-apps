import { join } from '@moondreamsdev/dreamer-ui/utils';

import SegmentedControl from '@/components/SegmentedControl';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { PRIORITIES, PRIORITY_DIAL_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { usePriorityDial } from '@apps/runway/hooks/usePriorityDial';
import {
  selectBills,
  selectEnvelopes,
  selectGoals,
  selectHasEverHadIncome,
} from '@apps/runway/store/selectors/runwaySelectors';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';

const OPTIONS = PRIORITIES.map((value) => ({
  value,
  ...PRIORITY_DIAL_WORDS.options[value],
}));

/** The Must, Should, Want dial, drawn only while the open view lists something to count; tinted whenever it leaves something out. */
function PriorityDial() {
  const today = todayAsUtcDate(useNow(60_000));
  const { planSection } = useRunwayUrlState();
  const hasIncome = useAppSelector(selectHasEverHadIncome);
  const count = useAppSelector((state) => {
    if (planSection === 'bills') return selectBills(state, today).length;
    if (planSection === 'envelopes')
      return selectEnvelopes(state, today).length;
    if (planSection === 'goals') return selectGoals(state, today).length;
    return 0;
  });
  const { dial, setDial, isTrimmed } = usePriorityDial();

  if (!hasIncome || count === 0) return null;
  return (
    <SegmentedControl
      label={PRIORITY_DIAL_WORDS.label}
      options={OPTIONS}
      value={dial}
      onChange={setDial}
      className={join(
        'w-56 shrink-0 max-[359px]:w-46 [&_button]:h-8 max-[359px]:[&_button]:px-1 max-[359px]:[&_button]:text-xs',
        isTrimmed && 'bg-accent ring-primary/50 ring-1',
      )}
    />
  );
}

export default PriorityDial;
