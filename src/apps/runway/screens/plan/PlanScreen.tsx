import { Settings2 } from 'lucide-react';

import EntryTile from '@/components/EntryTile';
import { useAppSelector } from '@/store';
import SwipeArea from '@/components/SwipeArea';
import PlanOverview from '@apps/runway/components/PlanOverview';
import { PLAN_MORE_LABEL, PLAN_SECTIONS } from '@apps/runway/constants';
import CardsScreen from '@apps/runway/screens/plan/CardsScreen';
import BillsScreen from '@apps/runway/screens/plan/BillsScreen';
import EnvelopesScreen from '@apps/runway/screens/plan/EnvelopesScreen';
import GoalsScreen from '@apps/runway/screens/plan/GoalsScreen';
import HorizonScreen from '@apps/runway/screens/plan/HorizonScreen';
import MoreScreen from '@apps/runway/screens/plan/MoreScreen';
import IncomeScreen from '@apps/runway/screens/plan/IncomeScreen';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import { selectHasEverHadIncome } from '@apps/runway/store/selectors/runwaySelectors';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';

const viewSections = PLAN_SECTIONS.filter((value) => value !== 'more');

const trackedSections = viewSections;
const untrackedSections = viewSections.filter((value) => value !== 'cards');

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

  const sections = isTracking ? trackedSections : untrackedSections;
  const showNeighbour = (direction: 1 | -1) => {
    const index = sections.findIndex((value) => value === planSection);
    const next = sections[index + direction];
    const isCovered = Array.from(
      document.querySelectorAll('[role="dialog"]'),
    ).some((dialog) => getComputedStyle(dialog).pointerEvents !== 'none');
    if (index >= 0 && next && !isCovered) showPlanSection(next);
  };

  return (
    <SwipeArea className='space-y-4' onSwipe={showNeighbour}>
      {hasIncome && (
        <PlanOverview
          sections={sections}
          current={isMore ? 'more' : planSection}
          onSelect={showPlanSection}
        />
      )}
      {planSection === 'envelopes' && <EnvelopesScreen />}
      {isMore && <MoreScreen />}
      {planSection === 'goals' && <GoalsScreen />}
      {planSection === 'horizon' && <HorizonScreen />}
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
    </SwipeArea>
  );
}

export default PlanScreen;
