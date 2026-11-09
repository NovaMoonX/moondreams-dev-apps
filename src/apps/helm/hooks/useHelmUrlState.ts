import { parseAsBoolean, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { useNavigate } from 'react-router-dom';

import { generateUuid } from '@/utils';
import { VIEW_PARENTS } from '@apps/helm/screen/views';
import type { HelmView } from '@apps/helm/types';

const URL_VIEWS = [
  'today',
  'inbox',
  'tasks',
  'settings',
  'activity',
] as const satisfies readonly HelmView[];

const MARKER = 'helmStep';
const FROM = 'helmFrom';
const LOAD_ID = generateUuid();

/** A view or sheet reached from home by an entry of its own, so Back can pop to home. */
const markStep = (from: HelmView) => {
  window.history.replaceState(
    { ...window.history.state, [MARKER]: LOAD_ID, [FROM]: from },
    '',
  );
};
// An entry marked before a reload has no home entry of this load beneath it to pop to.
const isStep = () => window.history.state?.[MARKER] === LOAD_ID;
const isStepFrom = (view: HelmView) =>
  isStep() && window.history.state?.[FROM] === view;
const clearStep = () => {
  window.history.replaceState({ ...window.history.state, [MARKER]: null }, '');
};

/** Helm's open view and its Browse sheet, kept in the URL so a reload and Back land where the person was. */
export function useHelmUrlState() {
  const navigate = useNavigate();
  const [{ view: requestedView, browse }, setUrl] = useQueryStates({
    view: parseAsStringLiteral(URL_VIEWS),
    browse: parseAsBoolean,
  });

  const view: HelmView = requestedView ?? 'home';
  const isBrowseOpen = browse === true && view === 'home';

  const openBrowse = async () => {
    await setUrl({ browse: true }, { history: 'push' });
    markStep('home');
  };

  const closeBrowse = () => {
    if (isStep()) {
      navigate(-1);
      return;
    }
    return setUrl({ browse: null }, { history: 'replace' });
  };

  /** Replaces the Browse entry when the sheet is open, so Back from the view lands on home. */
  const showView = async (next: HelmView) => {
    if (next === 'home') {
      await setUrl({ view: null, browse: null }, { history: 'replace' });
      clearStep();
      return;
    }
    if (isBrowseOpen) {
      await setUrl({ view: next, browse: null }, { history: 'replace' });
      markStep('home');
      return;
    }
    await setUrl({ view: next, browse: null }, { history: 'push' });
    markStep(view);
  };

  const goHome = () => {
    if (isStep()) {
      navigate(-1);
      return;
    }
    return setUrl({ view: null, browse: null }, { history: 'replace' });
  };

  /** Pops the entry only when the one beneath is the view's parent; otherwise replaces this one with the parent, so Back goes where its label says. */
  const goBack = async () => {
    const parent = VIEW_PARENTS[view] ?? 'home';
    if (isStepFrom(parent)) {
      navigate(-1);
      return;
    }
    const wasStep = isStep();
    await setUrl(
      { view: parent === 'home' ? null : parent, browse: null },
      { history: 'replace' },
    );
    if (parent === 'home') clearStep();
    else if (wasStep) markStep('home');
  };

  return {
    view,
    isBrowseOpen,
    openBrowse,
    closeBrowse,
    showView,
    goHome,
    goBack,
  };
}
