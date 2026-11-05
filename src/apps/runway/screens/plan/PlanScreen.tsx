import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
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
import {
  RunwayPreviewContext,
  useRunwayUrlState,
} from '@apps/runway/useRunwayUrlState';

const viewSections = PLAN_SECTIONS.filter((value) => value !== 'more');

const trackedSections = viewSections;
const untrackedSections = viewSections.filter((value) => value !== 'cards');

const END_DAMPING = 0.15;
const SLIDE_MS = 200;
/** The page shows between two views while they move, so their edges never touch. */
const VIEW_GAP_PX = 24;

const isCovered = () =>
  Array.from(document.querySelectorAll('[role="dialog"]')).some(
    (dialog) => getComputedStyle(dialog).pointerEvents !== 'none',
  );

/** A still copy of the view, without its floating controls or ids, standing where the view is now. */
const makeGhost = (body: HTMLElement) => {
  const ghost = body.cloneNode(true) as HTMLElement;
  ghost.querySelectorAll('.fixed').forEach((element) => element.remove());
  ghost
    .querySelectorAll('[id]')
    .forEach((element) => element.removeAttribute('id'));
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  Object.assign(ghost.style, {
    position: 'absolute',
    top: `${body.offsetTop}px`,
    left: body.style.left || '0px',
    width: `${body.offsetWidth}px`,
    margin: '0',
    pointerEvents: 'none',
    transition: 'none',
  });
  return ghost;
};

const placeBeside = (
  element: HTMLElement,
  body: HTMLElement,
  offset: number,
  direction: 1 | -1,
  transition: string,
) => {
  element.style.transition = transition;
  element.style.top = `${body.offsetTop}px`;
  element.style.width = `${body.offsetWidth}px`;
  element.style.left = `${offset + direction * (body.offsetWidth + VIEW_GAP_PX)}px`;
};

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
  const isTracking = useAppSelector(selectLevel) === 'track';
  const planSection =
    !hasIncome || (requestedSection === 'cards' && !isTracking)
      ? 'income'
      : requestedSection;
  const isMore = planSection === 'more';

  const bodyRef = useRef<HTMLDivElement>(null);
  const slideRef = useRef<{
    direction: 1 | -1;
    ghost: HTMLElement;
    timer: number;
  } | null>(null);
  // The view the finger is pulling in, drawn beside this one while the drag lasts.
  const [peek, setPeek] = useState<{
    section: PlanSection;
    direction: 1 | -1;
  } | null>(null);
  const peekRef = useRef<HTMLDivElement | null>(null);
  const peekTimerRef = useRef(0);
  const dragRef = useRef(0);
  const attachPeek = useCallback(
    (element: HTMLDivElement | null) => {
      peekRef.current = element;
      const body = bodyRef.current;
      if (element && body && peek)
        placeBeside(element, body, dragRef.current, peek.direction, 'none');
    },
    [peek],
  );
  const sections = isTracking ? trackedSections : untrackedSections;
  const getIndex = (section: PlanSection) =>
    sections.findIndex((value) => value === section);
  const getNeighbour = (direction: 1 | -1) => {
    const index = getIndex(planSection);
    return index >= 0 ? sections[index + direction] : undefined;
  };

  const endSlide = () => {
    const slide = slideRef.current;
    const body = bodyRef.current;
    if (slide) {
      window.clearTimeout(slide.timer);
      slide.ghost.remove();
    }
    slideRef.current = null;
    if (!body) return;
    body.style.transition = 'none';
    body.style.left = '0px';
    body.style.minHeight = '';
    delete body.dataset.moving;
  };

  // A copy of the leaving view slides out beside the arriving one, so the two move together like a carousel. The body moves by its own offset (not a transform, which would carry a floating add button with it).
  const slideTo = (next: PlanSection, direction: 1 | -1) => {
    const body = bodyRef.current;
    const isReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (slideRef.current) endSlide();
    if (!body || isReduced) {
      showPlanSection(next);
      return;
    }
    const ghost = makeGhost(body);
    body.before(ghost);
    // The leaving copy no longer holds the page's height, so the view keeps it until the slide ends.
    body.style.minHeight = `${body.offsetHeight}px`;
    setPeek(null);
    slideRef.current = {
      direction,
      ghost,
      // A request that lands on the same view never runs the entry below, so the copy is cleared here.
      timer: window.setTimeout(endSlide, SLIDE_MS * 3),
    };
    showPlanSection(next);
  };

  useLayoutEffect(() => {
    const body = bodyRef.current;
    const slide = slideRef.current;
    if (!body || !slide) return;
    const width = body.offsetWidth + VIEW_GAP_PX;
    body.style.transition = 'none';
    body.style.left = `${slide.direction * width + slide.ghost.offsetLeft}px`;
    const frame = requestAnimationFrame(() => {
      const easing = `left ${SLIDE_MS}ms ease-out`;
      body.style.transition = easing;
      body.style.left = '0px';
      slide.ghost.style.transition = easing;
      slide.ghost.style.left = `${-slide.direction * width}px`;
    });
    window.clearTimeout(slide.timer);
    slide.timer = window.setTimeout(endSlide, SLIDE_MS + 50);
    return () => cancelAnimationFrame(frame);
  }, [planSection]);

  useEffect(
    () => () => {
      const slide = slideRef.current;
      window.clearTimeout(peekTimerRef.current);
      if (!slide) return;
      window.clearTimeout(slide.timer);
      slide.ghost.remove();
    },
    [],
  );

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
    const transition = isEnd ? `left ${SLIDE_MS}ms ease-out` : 'none';
    const direction = dx < 0 ? 1 : -1;
    const next = getNeighbour(direction);
    const damping = next ? 1 : END_DAMPING;
    dragRef.current = isEnd ? 0 : dx * damping;
    body.style.transition = transition;
    body.style.left = `${dragRef.current}px`;
    window.clearTimeout(peekTimerRef.current);
    if (isEnd) {
      delete body.dataset.moving;
      if (peekRef.current && peek)
        placeBeside(peekRef.current, body, 0, peek.direction, transition);
      peekTimerRef.current = window.setTimeout(() => {
        if (!slideRef.current) setPeek(null);
      }, SLIDE_MS);
      return;
    }
    // Floating buttons belong to one view, so they step aside while two views share the screen.
    body.dataset.moving = '';
    const isReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (!next || isReduced) {
      if (peek) setPeek(null);
      return;
    }
    if (peek?.section !== next) setPeek({ section: next, direction });
    else if (peekRef.current)
      placeBeside(
        peekRef.current,
        body,
        dragRef.current,
        direction,
        transition,
      );
  };

  return (
    <SwipeArea
      className='relative space-y-4 overflow-x-clip'
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
      {peek && (
        <div
          ref={attachPeek}
          className='pointer-events-none absolute space-y-4 [&_.fixed]:hidden!'
          aria-hidden='true'
          inert
        >
          <RunwayPreviewContext.Provider value>
            <SectionView section={peek.section} />
          </RunwayPreviewContext.Provider>
        </div>
      )}
      <div
        ref={bodyRef}
        className='relative space-y-4 [&_.fixed]:transition-opacity data-moving:[&_.fixed]:opacity-0'
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
              onClick={() => showPlanSection('more')}
            />
          </div>
        )}
      </div>
    </SwipeArea>
  );
}

export default PlanScreen;
