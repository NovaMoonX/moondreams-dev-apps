import { useRef } from 'react';
import { Settings2 } from 'lucide-react';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import EntryTile from '@/components/EntryTile';
import { useAppSelector } from '@/store';
import SwipeViews, { type SwipeViewsHandle } from '@/components/SwipeViews';
import PlanOverview from '@apps/runway/components/PlanOverview';
import {
  PLAN_MORE_LABEL,
  PLAN_SECTIONS,
  PLAN_SELECT_WORDS,
} from '@apps/runway/constants';
import {
  PlanSelectLockContext,
  type PlanSelectLock,
} from '@apps/runway/hooks/usePlanSelection';
import CardsScreen from '@apps/runway/screens/plan/CardsScreen';
import BillsScreen from '@apps/runway/screens/plan/BillsScreen';
import EnvelopesScreen from '@apps/runway/screens/plan/EnvelopesScreen';
import GoalsScreen from '@apps/runway/screens/plan/GoalsScreen';
import HorizonScreen from '@apps/runway/screens/plan/HorizonScreen';
import MoreScreen from '@apps/runway/screens/plan/MoreScreen';
import IncomeScreen from '@apps/runway/screens/plan/IncomeScreen';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import { selectHasEverHadIncome } from '@apps/runway/store/selectors/runwaySelectors';
import type { PlanSection } from '@apps/runway/types';
import {
  RunwayPreviewContext,
  useRunwayUrlState,
} from '@apps/runway/useRunwayUrlState';
import { isTrackingLevel } from '@apps/runway/engine/level';

const viewSections = PLAN_SECTIONS.filter((value) => value !== 'more');

const trackedSections = viewSections;
const untrackedSections = viewSections.filter((value) => value !== 'cards');

function SectionView({ section }: { section: PlanSection }) {
  if (section === 'envelopes') return <EnvelopesScreen />;
  if (section === 'goals') return <GoalsScreen />;
  if (section === 'horizon') return <HorizonScreen />;
  if (section === 'bills') return <BillsScreen />;
  if (section === 'cards') return <CardsScreen />;
  if (section === 'income') return <IncomeScreen />;
  return <MoreScreen />;
}

function PlanScreen() {
  const { planSection: requestedSection, showPlanSection } =
    useRunwayUrlState();
  const hasIncome = useAppSelector(selectHasEverHadIncome);
  // Cards are part of tracking, like the Spend tab: hidden, not disabled, at Plan.
  const isTracking = isTrackingLevel(useAppSelector(selectLevel));
  const planSection =
    !hasIncome || (requestedSection === 'cards' && !isTracking)
      ? 'income'
      : requestedSection;
  const isMore = planSection === 'more';

  const swipeRef = useRef<SwipeViewsHandle<PlanSection>>(null);
  const selectLockRef = useRef<PlanSelectLock | null>(null);
  const { confirm } = useActionModal();
  const sections = isTracking ? trackedSections : untrackedSections;

  const select = async (section: PlanSection) => {
    if (section === planSection) return;
    const lock = selectLockRef.current;
    if (lock) {
      const noun = PLAN_SELECT_WORDS.noun[lock.view];
      const isLeaving =
        lock.count === 0 ||
        (await confirm({
          title: PLAN_SELECT_WORDS.leaveTitle,
          message: PLAN_SELECT_WORDS.leaveBody(lock.count, noun),
          confirmText: PLAN_SELECT_WORDS.leave,
        }));
      if (!isLeaving) return;
      lock.exit();
    }
    if (swipeRef.current) swipeRef.current.show(section);
    else showPlanSection(section);
  };

  return (
    <PlanSelectLockContext.Provider value={selectLockRef}>
      <SwipeViews
        ref={swipeRef}
        views={sections}
        current={planSection}
        onShow={showPlanSection}
        isPaused={() => selectLockRef.current !== null}
        className='space-y-4'
        bodyClassName='space-y-4'
        header={
          hasIncome && (
            <PlanOverview
              sections={sections}
              current={isMore ? 'more' : planSection}
              onSelect={(section) => void select(section)}
            />
          )
        }
        renderPeek={(section) => (
          <RunwayPreviewContext.Provider value>
            <SectionView section={section} />
          </RunwayPreviewContext.Provider>
        )}
      >
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
              onClick={() => void select('more')}
            />
          </div>
        )}
      </SwipeViews>
    </PlanSelectLockContext.Provider>
  );
}

export default PlanScreen;
