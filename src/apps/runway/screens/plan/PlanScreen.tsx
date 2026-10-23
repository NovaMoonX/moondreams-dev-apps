import { PillGroup } from '@/components/PillGroup';
import { PLAN_SECTION_LABELS, PLAN_SECTIONS } from '@apps/runway/constants';
import EnvelopesScreen from '@apps/runway/screens/plan/EnvelopesScreen';
import IncomeScreen from '@apps/runway/screens/plan/IncomeScreen';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';

const sectionOptions = PLAN_SECTIONS.map((value) => ({
  value,
  label: PLAN_SECTION_LABELS[value],
}));

function PlanScreen() {
  const { planSection, showPlanSection } = useRunwayUrlState();

  return (
    <div className='space-y-4'>
      <PillGroup
        label='Plan sections'
        options={sectionOptions}
        value={planSection}
        isThin
        onChange={showPlanSection}
      />
      {planSection === 'envelopes' ? <EnvelopesScreen /> : <IncomeScreen />}
    </div>
  );
}

export default PlanScreen;
