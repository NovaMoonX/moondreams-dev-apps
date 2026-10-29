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
import CardsScreen from '@apps/runway/screens/plan/CardsScreen';
import BillsScreen from '@apps/runway/screens/plan/BillsScreen';
import EnvelopesScreen from '@apps/runway/screens/plan/EnvelopesScreen';
import GoalsScreen from '@apps/runway/screens/plan/GoalsScreen';
import MoreScreen from '@apps/runway/screens/plan/MoreScreen';
import IncomeScreen from '@apps/runway/screens/plan/IncomeScreen';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import { selectHasEverHadIncome } from '@apps/runway/store/selectors/runwaySelectors';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import type { PlanSection } from '@apps/runway/types';

const NO_VIEW = '' as PlanSection;
const viewSections = PLAN_SECTIONS.filter((value) => value !== 'more');

const toOption = (value: (typeof viewSections)[number]) => ({
  value,
  label: PLAN_SECTION_LABELS[value],
  emoji: PLAN_VIEW_EMOJI[value],
});
const sectionOptions = viewSections.map(toOption);
const untrackedOptions = viewSections
  .filter((value) => value !== 'cards')
  .map(toOption);

function PlanScreen() {
  const { planSection: requestedSection, showPlanSection } =
    useRunwayUrlState();
  const hasIncome = useAppSelector(selectHasEverHadIncome);
  // Cards are part of tracking, like the Spend tab: hidden, not disabled, at Plan.
  const isTracking = useAppSelector(selectLevel) === 'track';
  const planSection =
    !hasIncome || (requestedSection === 'cards' && !isTracking)
      ? 'income'
      : requestedSection;
  const isMore = planSection === 'more';

  return (
    <div className='space-y-4'>
      {hasIncome && (
        <PillGroup
          label='Plan sections'
          options={isTracking ? sectionOptions : untrackedOptions}
          value={isMore ? NO_VIEW : planSection}
          isThin
          onChange={showPlanSection}
        />
      )}
      {planSection === 'envelopes' && <EnvelopesScreen />}
      {isMore && <MoreScreen />}
      {planSection === 'goals' && <GoalsScreen />}
      {planSection === 'bills' && <BillsScreen />}
      {planSection === 'cards' && <CardsScreen />}
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
