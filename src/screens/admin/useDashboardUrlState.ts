import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { useNavigate } from 'react-router-dom';

const VIEWS = ['apps', 'members'] as const;
const SECTIONS = ['usage', 'settings'] as const;

export type DashboardSection = (typeof SECTIONS)[number];

const URL_KEYS = {
  view: parseAsStringLiteral(VIEWS),
  app: parseAsString,
  section: parseAsStringLiteral(SECTIONS),
  member: parseAsString,
};

const CLEARED = { view: null, app: null, section: null, member: null };

interface NavigateOptions {
  /** A step the person expects Back to undo (opening a screen from the list); anything else replaces the entry. */
  isStep?: boolean;
}

/** The admin dashboard's state, kept in the URL (`?view=members`, `?app=nine-lives&section=settings`, `?member=<uid>`) so refresh, Back and a shared link all land in the same place. */
export function useDashboardUrlState() {
  const navigate = useNavigate();
  const [state, setState] = useQueryStates(URL_KEYS);

  const getHistory = (options?: NavigateOptions) => (options?.isStep ? 'push' : 'replace');

  const showMembers = (options?: NavigateOptions) =>
    setState({ view: 'members', app: null, section: null, member: null }, { history: getHistory(options) });

  const showApp = (appId: string, options?: NavigateOptions) =>
    setState({ view: 'apps', app: appId, section: null, member: null }, { history: getHistory(options) });

  const setSection = (section: DashboardSection) => setState({ section }, { history: 'replace' });

  const openMember = (uid: string | null) =>
    setState({ member: uid }, { history: uid ? 'push' : 'replace' });

  // Back undoes the step that opened this screen; arriving by a link (no earlier entry) clears it instead.
  const goBack = () => {
    const historyIndex = window.history.state?.idx;
    if (typeof historyIndex === 'number' && historyIndex > 0) {
      navigate(-1);
      return;
    }
    setState(CLEARED, { history: 'replace' });
  };

  return {
    view: state.view,
    app: state.app,
    section: state.section ?? 'usage',
    member: state.member,
    showMembers,
    showApp,
    setSection,
    openMember,
    goBack,
  };
}
