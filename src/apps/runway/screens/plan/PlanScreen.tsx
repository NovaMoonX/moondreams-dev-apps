import { useRef } from 'react';
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

const DRAG_DAMPING = 0.4;

const isCovered = () =>
  Array.from(document.querySelectorAll('[role="dialog"]')).some(
    (dialog) => getComputedStyle(dialog).pointerEvents !== 'none',
  );

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

  const bodyRef = useRef<HTMLDivElement>(null);
  const sections = isTracking ? trackedSections : untrackedSections;
  const showNeighbour = (direction: 1 | -1) => {
    const index = sections.findIndex((value) => value === planSection);
    const next = sections[index + direction];
    if (index >= 0 && next && !isCovered()) showPlanSection(next);
  };
  // The body follows the finger by its own offset (not a transform, which would carry a floating add button with it) and eases back to rest.
  const followFinger = (dx: number, isEnd: boolean) => {
    const body = bodyRef.current;
    if (!body || (!isEnd && isCovered())) return;
    body.style.transition = isEnd ? 'left 200ms ease-out' : 'none';
    body.style.left = `${isEnd ? 0 : dx * DRAG_DAMPING}px`;
  };

  return (
    <SwipeArea
      className='space-y-4 overflow-x-clip'
      onSwipe={showNeighbour}
      onDrag={followFinger}
    >
      {hasIncome && (
        <PlanOverview
          sections={sections}
          current={isMore ? 'more' : planSection}
          onSelect={showPlanSection}
        />
      )}
      <div ref={bodyRef} className='relative space-y-4'>
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
      </div>
    </SwipeArea>
  );
}

export default PlanScreen;
