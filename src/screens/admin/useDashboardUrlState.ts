import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { useNavigate } from 'react-router-dom';

const VIEWS = ['apps', 'pipeline', 'members', 'firebase'] as const;
const TABS = ['cost', 'how'] as const;
const SECTIONS = ['usage', 'settings', 'features'] as const;

export type DashboardSection = (typeof SECTIONS)[number];
export type PipelineTab = (typeof TABS)[number];

const URL_KEYS = {
  view: parseAsStringLiteral(VIEWS),
  app: parseAsString,
  section: parseAsStringLiteral(SECTIONS),
  tab: parseAsStringLiteral(TABS),
  member: parseAsString,
};

interface DashboardUrlValues {
  view: (typeof VIEWS)[number] | null;
  app: string | null;
  section: DashboardSection | null;
  tab: PipelineTab | null;
  member: string | null;
}

const CLEARED: DashboardUrlValues = {
  view: null,
  app: null,
  section: null,
  tab: null,
  member: null,
};

interface NavigateOptions {
  isStep?: boolean;
}

/** The admin dashboard's state, kept in the URL so refresh, Back and a shared link land in the same place. */
export function useDashboardUrlState() {
  const navigate = useNavigate();
  const [state, setState] = useQueryStates(URL_KEYS);

  // nuqs writes the URL without telling the router, so `history.state.idx` can't say whether Back has
  // an entry of ours to pop; the entries this hook pushes carry their own marker instead.
  const markStep = () =>
    window.history.replaceState(
      { ...window.history.state, dashboardStep: true },
      '',
    );

  const update = (next: DashboardUrlValues, options?: NavigateOptions) => {
    const result = setState(next, {
      history: options?.isStep ? 'push' : 'replace',
    });
    if (options?.isStep) void result.then(markStep);
  };

  const showPipeline = (options?: NavigateOptions) =>
    update(
      { view: 'pipeline', app: null, section: null, tab: null, member: null },
      options,
    );

  const showMembers = (options?: NavigateOptions) =>
    update(
      { view: 'members', app: null, section: null, tab: null, member: null },
      options,
    );

  const showFirebase = (options?: NavigateOptions) =>
    update(
      { view: 'firebase', app: null, section: null, tab: null, member: null },
      options,
    );

  const showApp = (appId: string, options?: NavigateOptions) =>
    update(
      { view: 'apps', app: appId, section: null, tab: null, member: null },
      options,
    );

  const setSection = (section: DashboardSection) =>
    setState({ section }, { history: 'replace' });

  const setTab = (tab: PipelineTab | null) =>
    setState({ tab }, { history: 'replace' });

  const openMember = (uid: string | null) =>
    setState({ member: uid }, { history: 'replace' });

  const goBack = () => {
    if (window.history.state?.dashboardStep) {
      navigate(-1);
      return;
    }
    setState(CLEARED, { history: 'replace' });
  };

  return {
    view: state.view,
    app: state.app,
    section: state.section ?? 'usage',
    tab: state.tab,
    member: state.member,
    showPipeline,
    showMembers,
    showFirebase,
    showApp,
    setSection,
    setTab,
    openMember,
    goBack,
  };
}
