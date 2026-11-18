// The words the vendored planner uses; keep in step with PLANNER_COPY in src/apps/helm/constants.ts.
export const PLANNER_COPY = {
  estimate: 'about 30 min · estimate',
  estimateOf: (length: string) => `about ${length} · estimate`,
  fitsBefore: (length: string, title: string) =>
    `${length} · fits before ${title}`,
  fitsAfter: (length: string, title: string) =>
    `${length} · fits after ${title}`,
  overdue: 'Overdue',
  dueToday: 'Due today',
  dueTomorrow: 'Due tomorrow',
  due: (when: string) => `Due ${when}`,
  must: 'Must do',
  should: 'Should do',
  could: 'Could do',
  worthDoing: 'Worth doing today',
  home: "You're home",
} as const;
