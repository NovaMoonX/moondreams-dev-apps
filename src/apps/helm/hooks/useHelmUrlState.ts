import {
  parseAsBoolean,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from 'nuqs';
import { useNavigate } from 'react-router-dom';

import { generateUuid } from '@/utils';
import { VIEW_PARENTS } from '@apps/helm/screen/views';
import type { HelmView } from '@apps/helm/types';

const URL_VIEWS = [
  'today',
  'inbox',
  'tasks',
  'comingUp',
  'settings',
  'activity',
  'connectedApps',
  'connection',
  'people',
  'who',
  'place',
  'projects',
  'project',
  'knowledge',
  'topic',
  'procedures',
  'procedure',
  'run',
  'howNomosSeesYou',
] as const satisfies readonly HelmView[];

const MARKER = 'helmStep';
const FROM = 'helmFrom';
const FROM_ITEM = 'helmFromItem';
const LOAD_ID = generateUuid();

/** A view or sheet reached from home by an entry of its own, so Back can pop to home. */
const markStep = (from: HelmView, fromItem: string | null = null) => {
  window.history.replaceState(
    {
      ...window.history.state,
      [MARKER]: LOAD_ID,
      [FROM]: from,
      [FROM_ITEM]: fromItem,
    },
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

/** The open view, its Browse sheet and the conversation over a page, kept in the URL so a reload and Back land where the person was. */
export function useHelmUrlState() {
  const navigate = useNavigate();
  const [{ view: requestedView, browse, ask, grant, item }, setUrl] =
    useQueryStates({
      view: parseAsStringLiteral(URL_VIEWS),
      browse: parseAsBoolean,
      ask: parseAsStringLiteral(['page'] as const),
      grant: parseAsString,
      item: parseAsString,
    });

  const view: HelmView = requestedView ?? 'home';
  const isBrowseOpen = browse === true && view === 'home';

  const isAskRequested = ask === 'page';

  // The conversation's own layer pushes the entry, so the address only changes in place.
  const openAsk = () => setUrl({ ask: 'page' }, { history: 'replace' });
  const closeAsk = () => setUrl({ ask: null }, { history: 'replace' });

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

  /** Replaces the Browse entry when the sheet is open, so Back from the view lands on home. `id` is the connection, who or place the view opens on. */
  const showView = async (next: HelmView, id: string | null = null) => {
    if (next === 'home') {
      await setUrl(
        { view: null, browse: null, grant: null, item: null },
        { history: 'replace' },
      );
      clearStep();
      return;
    }
    const target = {
      view: next,
      browse: null,
      ask: null,
      grant: next === 'connection' ? id : null,
      item:
        next === 'who' ||
        next === 'place' ||
        next === 'project' ||
        next === 'topic' ||
        next === 'procedure' ||
        next === 'run'
          ? id
          : null,
    };
    if (isBrowseOpen) {
      await setUrl(target, { history: 'replace' });
      markStep('home');
      return;
    }
    await setUrl(target, { history: 'push' });
    markStep(view, item);
  };

  /** Back to a record's parent record (a subtopic's topic): pops when the entry beneath is that record, else replaces this entry with it and keeps what lies beneath. */
  const goUpTo = async (next: (typeof URL_VIEWS)[number], id: string) => {
    const state = (window.history.state ?? {}) as Record<string, unknown>;
    if (isStep() && state[FROM] === next && state[FROM_ITEM] === id) {
      navigate(-1);
      return;
    }
    const wasStep = isStep();
    const from = state[FROM] as HelmView | undefined;
    const fromItem = (state[FROM_ITEM] as string | null | undefined) ?? null;
    await setUrl(
      { view: next, browse: null, ask: null, grant: null, item: id },
      { history: 'replace' },
    );
    if (wasStep && from) markStep(from, fromItem);
  };

  const goHome = () => {
    if (isStep()) {
      navigate(-1);
      return;
    }
    return setUrl(
      { view: null, browse: null, grant: null, item: null },
      { history: 'replace' },
    );
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
      {
        view: parent === 'home' ? null : parent,
        browse: null,
        grant: null,
        item: null,
      },
      { history: 'replace' },
    );
    if (parent === 'home') clearStep();
    else if (wasStep) markStep('home');
  };

  const origin: HelmView | null = isStep()
    ? (window.history.state?.[FROM] ?? null)
    : null;

  /** Back for a view that can be opened from several doors: pops to the one it was opened from when the history knows it, else goes to its parent. */
  const goBackToOrigin = () => {
    if (origin) {
      navigate(-1);
      return;
    }
    return goBack();
  };

  return {
    view,
    origin,
    grant,
    item,
    isBrowseOpen,
    isAskRequested,
    openAsk,
    closeAsk,
    openBrowse,
    closeBrowse,
    showView,
    goHome,
    goBack,
    goBackToOrigin,
    goUpTo,
  };
}
