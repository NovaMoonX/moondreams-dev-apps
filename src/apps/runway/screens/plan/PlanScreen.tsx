import { useLayoutEffect, useRef } from 'react';
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
import type { PlanSection } from '@apps/runway/types';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';

const viewSections = PLAN_SECTIONS.filter((value) => value !== 'more');

const trackedSections = viewSections;
const untrackedSections = viewSections.filter((value) => value !== 'cards');

const END_DAMPING = 0.15;
const SLIDE_MS = 200;

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
  const slideRef = useRef<{ direction: 1 | -1; isEntering: boolean } | null>(
    null,
  );
  const sections = isTracking ? trackedSections : untrackedSections;
  const getIndex = (section: PlanSection) =>
    sections.findIndex((value) => value === section);
  const getNeighbour = (direction: 1 | -1) => {
    const index = getIndex(planSection);
    return index >= 0 ? sections[index + direction] : undefined;
  };

  // The body moves by its own offset (not a transform, which would carry a floating add button with it): out to one side, then the next view in from the other.
  const slideTo = (next: PlanSection, direction: 1 | -1) => {
    const body = bodyRef.current;
    const isReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (!body || isReduced) {
      showPlanSection(next);
      return;
    }
    slideRef.current = { direction, isEntering: false };
    body.style.transition = `left ${SLIDE_MS}ms ease-in`;
    body.style.left = `${-direction * body.offsetWidth}px`;
    window.setTimeout(() => {
      if (slideRef.current) slideRef.current.isEntering = true;
      showPlanSection(next);
    }, SLIDE_MS);
  };

  useLayoutEffect(() => {
    const body = bodyRef.current;
    const slide = slideRef.current;
    if (!body || !slide?.isEntering) return;
    slideRef.current = null;
    body.style.transition = 'none';
    body.style.left = `${slide.direction * body.offsetWidth}px`;
    const frame = requestAnimationFrame(() => {
      body.style.transition = `left ${SLIDE_MS}ms ease-out`;
      body.style.left = '0px';
    });
    return () => cancelAnimationFrame(frame);
  }, [planSection]);

  const showNeighbour = (direction: 1 | -1) => {
    const next = getNeighbour(direction);
    if (next && !isCovered()) slideTo(next, direction);
  };
  const select = (section: PlanSection) => {
    const from = getIndex(planSection);
    const to = getIndex(section);
    if (section === planSection) return;
    if (from < 0 || to < 0) showPlanSection(section);
    else slideTo(section, to > from ? 1 : -1);
  };
  const followFinger = (dx: number, isEnd: boolean) => {
    const body = bodyRef.current;
    if (!body || slideRef.current || (!isEnd && isCovered())) return;
    body.style.transition = isEnd ? `left ${SLIDE_MS}ms ease-out` : 'none';
    const damping = getNeighbour(dx < 0 ? 1 : -1) ? 1 : END_DAMPING;
    body.style.left = `${isEnd ? 0 : dx * damping}px`;
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
          onSelect={select}
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
