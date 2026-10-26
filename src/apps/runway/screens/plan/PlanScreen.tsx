import { useAppSelector } from '@/store';
import { PillGroup } from '@/components/PillGroup';
import { PLAN_SECTION_LABELS, PLAN_SECTIONS } from '@apps/runway/constants';
import BillsScreen from '@apps/runway/screens/plan/BillsScreen';
import EnvelopesScreen from '@apps/runway/screens/plan/EnvelopesScreen';
import GoalsScreen from '@apps/runway/screens/plan/GoalsScreen';
import MoreScreen from '@apps/runway/screens/plan/MoreScreen';
import IncomeScreen from '@apps/runway/screens/plan/IncomeScreen';
import { selectHasEverHadIncome } from '@apps/runway/store/selectors/runwaySelectors';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';

const sectionOptions = PLAN_SECTIONS.map((value) => ({
  value,
  label: PLAN_SECTION_LABELS[value],
}));

function PlanScreen() {
  const { planSection: requestedSection, showPlanSection } =
    useRunwayUrlState();
  const hasIncome = useAppSelector(selectHasEverHadIncome);
  const planSection = hasIncome ? requestedSection : 'income';

  return (
    <div className='space-y-4'>
      {hasIncome && (
        <PillGroup
          label='Plan sections'
          options={sectionOptions}
          value={planSection}
          isThin
          onChange={showPlanSection}
        />
      )}
      {planSection === 'envelopes' && <EnvelopesScreen />}
      {planSection === 'more' && <MoreScreen />}
      {planSection === 'goals' && <GoalsScreen />}
      {planSection === 'bills' && <BillsScreen />}
      {planSection === 'income' && <IncomeScreen />}
    </div>
  );
}

export default PlanScreen;
