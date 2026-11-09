import { parseAsBoolean, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { useNavigate } from 'react-router-dom';

import type { HelmView } from '@apps/helm/types';

const URL_VIEWS = ['today'] as const satisfies readonly HelmView[];

const MARKER = 'helmStep';

/** A view or sheet reached from home by an entry of its own, so Back can pop to home; nuqs writes don't tell the router, so the entry carries the marker itself. */
const markStep = () => {
  window.history.replaceState({ ...window.history.state, [MARKER]: true }, '');
};
const isStep = () => Boolean(window.history.state?.[MARKER]);

/** Helm's open view and its Browse sheet, kept in the URL so a reload and Back land where the person was. */
export function useHelmUrlState() {
  const navigate = useNavigate();
  const [{ view: requestedView, browse }, setUrl] = useQueryStates({
    view: parseAsStringLiteral(URL_VIEWS),
    browse: parseAsBoolean,
  });

  const view: HelmView = requestedView ?? 'home';
  const isBrowseOpen = browse === true;

  const openBrowse = async () => {
    await setUrl({ browse: true }, { history: 'push' });
    markStep();
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
      return;
    }
    if (isBrowseOpen) {
      await setUrl({ view: next, browse: null }, { history: 'replace' });
      markStep();
      return;
    }
    await setUrl({ view: next }, { history: 'push' });
    markStep();
  };

  const goHome = () => {
    if (isStep()) {
      navigate(-1);
      return;
    }
    return setUrl({ view: null, browse: null }, { history: 'replace' });
  };

  return { view, isBrowseOpen, openBrowse, closeBrowse, showView, goHome };
}
