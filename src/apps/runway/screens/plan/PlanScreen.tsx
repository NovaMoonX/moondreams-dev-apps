import { Settings2 } from 'lucide-react';

import EntryTile from '@/components/EntryTile';
import { useAppSelector } from '@/store';
import { PillGroup } from '@/components/PillGroup';
import {
  PLAN_MORE_LABEL,
  PLAN_SECTION_LABELS,
  PLAN_SECTIONS,
  PLAN_VIEW_EMOJI,
} from '@apps/runway/constants';
import BillsScreen from '@apps/runway/screens/plan/BillsScreen';
import EnvelopesScreen from '@apps/runway/screens/plan/EnvelopesScreen';
import GoalsScreen from '@apps/runway/screens/plan/GoalsScreen';
import MoreScreen from '@apps/runway/screens/plan/MoreScreen';
import IncomeScreen from '@apps/runway/screens/plan/IncomeScreen';
import { selectHasEverHadIncome } from '@apps/runway/store/selectors/runwaySelectors';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import type { PlanSection } from '@apps/runway/types';

const NO_VIEW = '' as PlanSection;
const viewSections = PLAN_SECTIONS.filter((value) => value !== 'more');

const sectionOptions = viewSections.map((value) => ({
  value,
  label: PLAN_SECTION_LABELS[value],
  emoji: PLAN_VIEW_EMOJI[value],
}));

function PlanScreen() {
  const { planSection: requestedSection, showPlanSection } =
    useRunwayUrlState();
  const hasIncome = useAppSelector(selectHasEverHadIncome);
  const planSection = hasIncome ? requestedSection : 'income';
  const isMore = planSection === 'more';

  return (
    <div className='space-y-4'>
      {hasIncome && (
        <PillGroup
          label='Plan sections'
          options={sectionOptions}
          value={isMore ? NO_VIEW : planSection}
          isThin
          onChange={showPlanSection}
        />
      )}
      {planSection === 'envelopes' && <EnvelopesScreen />}
      {isMore && <MoreScreen />}
      {planSection === 'goals' && <GoalsScreen />}
      {planSection === 'bills' && <BillsScreen />}
      {planSection === 'income' && <IncomeScreen />}
      {hasIncome && !isMore && (
        <div className='grid'>
          <EntryTile
            icon={<Settings2 className='h-4 w-4' />}
            label={PLAN_MORE_LABEL}
            onClick={() => showPlanSection('more')}
          />
        </div>
      )}
    </div>
  );
}

export default PlanScreen;
