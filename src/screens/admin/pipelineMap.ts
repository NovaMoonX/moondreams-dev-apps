export type MapLane = 'work' | 'ship';

export interface MapNode {
  id: string;
  lane: MapLane;
  /** Nodes with the same step sit side by side from `sm` and share the arrow into them. */
  step: number;
  title: string;
  does: string;
  parts?: { name: string; does: string }[];
  /** The rows of the pipeline's step table this node draws, by their Step name. */
  covers?: string[];
}

export interface MapEdge {
  from: string;
  to: string;
  label: string;
}

export const MAP_LANES: { id: MapLane; title: string; intro: string | null }[] =
  [
    { id: 'work', title: 'From your ask to your answer', intro: null },
    {
      id: 'ship',
      title: 'Shipping it',
      intro: 'When a pull request is ready to merge',
    },
  ];

/** Rows of the step table the map leaves out on purpose, with why. */
export const OFF_MAP: Record<string, string> = {
  "Take over someone else's PR": 'Only when asked, off the main path.',
};

// A change to the pipeline edits these lists; a CI check fails a PR that adds a step without placing it here.
export const MAP_NODES: MapNode[] = [
  {
    id: 'owner',
    lane: 'work',
    step: 1,
    title: 'You',
    does: 'Ask for work from your phone and answer what the pipeline raises.',
  },
  {
    id: 'session',
    covers: [
      'Large or multi-issue work',
      "A new app's MVP",
      'What a push needs',
      'Hint to orchestrate',
      'Plan shape',
      'Fresh-start nudge',
      'Improving the pipeline',
    ],
    lane: 'work',
    step: 2,
    title: 'Claude Code session',
    does: 'Plans the work, briefs the helpers and tells you when it needs you.',
    parts: [
      { name: 'Orchestrate hint', does: 'steers big jobs through the plan' },
      { name: 'Plan check', does: 'sends back a plan that is too dense to read in a minute' },
      { name: 'Pipeline pulse', does: 'reports working or waiting' },
      {
        name: 'Fresh-start nudge',
        does: 'suggests a new chat before one gets long',
      },
      { name: 'PR gate', does: 'makes sure every pull request is finished' },
    ],
  },
  {
    id: 'plan',
    covers: ['Plan an app', 'Create issues', 'Put issues on the board'],
    lane: 'work',
    step: 3,
    title: 'Plan and issues',
    does: 'Planners on Opus break the ask into issues, created and put on the board.',
  },
  {
    id: 'helpers',
    covers: ['Review'],
    lane: 'work',
    step: 4,
    title: 'Helpers',
    does: 'Smaller, cheaper workers the session hands pieces to.',
    parts: [
      { name: 'Implementer (Sonnet)', does: 'builds what the brief asks' },
      { name: 'Validator (Haiku)', does: 'runs the quick checks' },
      { name: 'Reviewers', does: 'read the change for bugs, product and look' },
      {
        name: 'Lead reviewer (Opus)',
        does: 'settles the findings of a large change',
      },
    ],
  },
  {
    id: 'pr',
    covers: ['Wrap-up', 'Status'],
    lane: 'work',
    step: 5,
    title: 'Pull request',
    does: 'Holds the change, with a status comment and screenshots.',
  },
  {
    id: 'inbox',
    lane: 'work',
    step: 6,
    title: 'Inbox workflow',
    does: 'Gathers every open pull request and what it needs from you.',
  },
  {
    id: 'dashboard',
    covers: ['Pipeline view', 'Decisions and follow-ups'],
    lane: 'work',
    step: 7,
    title: 'This dashboard',
    does: 'Shows what waits on you, live, and lets you answer.',
  },
  {
    id: 'inboxIssue',
    lane: 'work',
    step: 7,
    title: '📥 Owner inbox issue',
    does: 'The same list on GitHub, for when you are not here.',
  },
  {
    id: 'answers',
    lane: 'work',
    step: 8,
    title: 'Your answers',
    does: 'Posted as a comment on the pull request they belong to.',
  },
  {
    id: 'keepCurrent',
    covers: ['Keep PRs current'],
    lane: 'ship',
    step: 1,
    title: 'Keeping PRs current',
    does: 'Labels a pull request that is behind its base, and a one-command sync brings it up to date.',
  },
  {
    id: 'automerge',
    covers: ['Merge on a standing go'],
    lane: 'ship',
    step: 2,
    title: 'Automerge (on your go)',
    does: 'When you say go, merges the ready pull requests for you, in order.',
  },
  {
    id: 'queue',
    covers: ['One merge at a time'],
    lane: 'ship',
    step: 3,
    title: 'Merge queue',
    does: 'One merge into main at a time, in order.',
  },
  {
    id: 'deploy',
    lane: 'ship',
    step: 4,
    title: 'Deploy',
    does: 'Rules, functions and the site go live once a merge lands.',
  },
];

export const MAP_EDGES: MapEdge[] = [
  { from: 'owner', to: 'session', label: 'Asks for work' },
  { from: 'session', to: 'plan', label: 'Plans first' },
  { from: 'plan', to: 'helpers', label: 'Hands off pieces' },
  { from: 'helpers', to: 'pr', label: 'Their work is opened as' },
  { from: 'pr', to: 'inbox', label: 'On every push' },
  { from: 'inbox', to: 'dashboard', label: 'Sends the list' },
  { from: 'inbox', to: 'inboxIssue', label: 'Updates' },
  { from: 'dashboard', to: 'answers', label: 'You reply' },
  {
    from: 'answers',
    to: 'session',
    label: 'The session picks them up and carries on',
  },
  { from: 'pr', to: 'keepCurrent', label: 'Ready to merge' },
  { from: 'keepCurrent', to: 'automerge', label: 'Up to date' },
  { from: 'automerge', to: 'queue', label: 'On your go' },
  { from: 'queue', to: 'deploy', label: 'Merged' },
];

const nodeById = new Map(MAP_NODES.map((node) => [node.id, node]));

export const getMapNode = (id: string) => nodeById.get(id);

/** The steps of a lane in order, each with its nodes. */
export const getLaneSteps = (lane: MapLane) =>
  MAP_NODES.filter((node) => node.lane === lane)
    .reduce<MapNode[][]>((steps, node) => {
      const index = steps.findIndex((step) => step[0]?.step === node.step);
      if (index === -1) return [...steps, [node]];
      return steps.map((step, at) => (at === index ? [...step, node] : step));
    }, [])
    .sort((a, b) => (a[0]?.step ?? 0) - (b[0]?.step ?? 0));

/** What the arrow between two steps says: the labels of the edges that run from one to the other. */
export const getArrowLabel = (from: MapNode[], to: MapNode[]) =>
  [
    ...new Set(
      MAP_EDGES.filter(
        (edge) =>
          from.some((node) => node.id === edge.from) &&
          to.some((node) => node.id === edge.to),
      ).map((edge) => edge.label),
    ),
  ].join(' · ');

/** Edges that lead back to a node earlier in the flow, drawn under the node they leave. */
export const getReturns = (node: MapNode) =>
  MAP_EDGES.filter((edge) => edge.from === node.id).flatMap((edge) => {
    const target = getMapNode(edge.to);
    if (!target || target.lane !== node.lane || target.step >= node.step)
      return [];
    return [{ target, label: edge.label }];
  });

/** The edge that enters a lane from another lane. */
export const getLaneEntry = (lane: MapLane) => {
  const first = getLaneSteps(lane)[0] ?? [];
  return MAP_EDGES.find(
    (edge) =>
      first.some((node) => node.id === edge.to) &&
      getMapNode(edge.from)?.lane !== lane,
  );
};
