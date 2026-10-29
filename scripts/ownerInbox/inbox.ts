export const STATUS_MARKER = '<!-- pr-status -->';
export const INBOX_MARKER = '<!-- owner-inbox -->';
const SESSION_MARKER = /<!--\s*session:\s*(\S+)\s*-->/;

export type CiState = 'green' | 'red' | 'running' | 'none';

export const INBOX_JOB = 'owner-inbox';

export interface CheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
}

/** A head's CI from its check runs: only each check's latest run counts (a re-run replaces a failure), and the inbox's own job is left out. */
export function summarizeCi(runs: readonly CheckRun[]): CiState {
  const latest = [
    ...runs
      .filter((run) => run.name !== INBOX_JOB)
      .reduce<Map<string, CheckRun>>((acc, run) => {
        const kept = acc.get(run.name);
        return kept && kept.id > run.id ? acc : new Map(acc).set(run.name, run);
      }, new Map())
      .values(),
  ];
  if (latest.length === 0) return 'none';
  const isFailed = (run: CheckRun) =>
    ['failure', 'timed_out', 'action_required'].includes(run.conclusion ?? '');
  if (latest.some(isFailed)) return 'red';
  return latest.some((run) => run.status !== 'completed') ? 'running' : 'green';
}

export interface PrStatus {
  sessionUrl: string | null;
  sessionTitle: string | null;
  /** The word after "Status ·" in the heading: ready to merge, blocked, in progress. */
  state: string | null;
  ownerItems: string[];
  goodToKnow: string[];
  screenshots: string[];
  updatedAt: string;
}

export interface InboxPr {
  number: number;
  title: string;
  url: string;
  head: string;
  base: string;
  isDraft: boolean;
  labels: string[];
  ci: CiState;
  /** The session link in the PR body's attribution, for PRs whose status comment predates the session marker. */
  bodySessionUrl: string | null;
  status: PrStatus | null;
}

const SESSION_LINK = /https:\/\/claude\.ai\/code\/session_[A-Za-z0-9]+/g;

/** The last Claude session link in a PR body, or null. */
export const findSessionLink = (body: string | null) =>
  (body ?? '').match(SESSION_LINK)?.at(-1) ?? null;

const lines = (text: string) => text.split(/\r?\n/);

/** The lines under a bold heading (`**Name**` alone or followed by text), up to the next bold heading or `##`. */
const section = (body: string, name: string): string[] => {
  const all = lines(body);
  const start = all.findIndex((line) =>
    line.trim().toLowerCase().startsWith(`**${name.toLowerCase()}`),
  );
  if (start === -1) return [];
  const rest = all.slice(start + 1);
  const end = rest.findIndex((line) => /^\s*(\*\*[^*]+\*\*|##)/.test(line));
  return end === -1 ? rest : rest.slice(0, end);
};

const bullet = (line: string) =>
  line
    .replace(/^\s*[-*]\s+(\[[ xX]\]\s+)?/, '')
    .replace(/\s*\(who:[^)]*\)\s*$/i, '')
    .trim();

const isOpenBox = (line: string) => /^\s*[-*]\s+\[ \]/.test(line);
const isForOwner = (line: string) =>
  /\(who:[^)]*\bowner\b[^)]*\)\s*$/i.test(line);

/** Reads a PR's `📋 Status` comment: its session, state, unchecked owner items, good-to-know notes and latest screenshots. */
export function parseStatus(body: string, updatedAt: string): PrStatus {
  const sessionUrl = body.match(SESSION_MARKER)?.[1] ?? null;
  const titleLine = lines(body).find((line) =>
    /^\s*\*\*Session:\*\*/.test(line),
  );
  const sessionTitle = titleLine
    ? titleLine.replace(/^\s*\*\*Session:\*\*\s*/, '').trim() || null
    : null;
  const heading = lines(body).find((line) => /^##\s+📋\s*Status/.test(line));
  const state = heading?.split('·')[1]?.trim() || null;
  const ownerItems = lines(body)
    .filter((line) => isOpenBox(line) && isForOwner(line))
    .map(bullet);
  const goodToKnow = section(body, 'Good to know')
    .filter((line) => /^\s*[-*]\s+/.test(line))
    .map(bullet);
  const screenshots = section(body, 'New screenshots')
    .join(' ')
    .match(/https:\/\/[^\s)"'<>]+/g);
  return {
    sessionUrl,
    sessionTitle,
    state,
    ownerItems,
    goodToKnow,
    screenshots: screenshots ?? [],
    updatedAt,
  };
}

interface Session {
  key: string;
  title: string;
  url: string | null;
  prs: InboxPr[];
}

type Standing = 'needsYou' | 'needsFixing' | 'inProgress' | 'waiting';

const STANDING_ORDER: Standing[] = [
  'needsYou',
  'needsFixing',
  'inProgress',
  'waiting',
];

const ownerCount = (session: Session) =>
  session.prs.reduce((sum, pr) => sum + (pr.status?.ownerItems.length ?? 0), 0);

const isBroken = (pr: InboxPr) =>
  pr.ci === 'red' || pr.labels.includes('merge-conflict');

const getStanding = (session: Session): Standing => {
  if (ownerCount(session) > 0) return 'needsYou';
  if (session.prs.some(isBroken)) return 'needsFixing';
  const isMoving = session.prs.some(
    (pr) => pr.ci === 'running' || /progress/i.test(pr.status?.state ?? ''),
  );
  return isMoving ? 'inProgress' : 'waiting';
};

const latestUpdate = (session: Session) =>
  session.prs
    .map((pr) => pr.status?.updatedAt ?? '')
    .reduce((latest, at) => (at > latest ? at : latest), '');

const formatWhen = (iso: string) => {
  if (!iso) return 'never (no status comment yet)';
  const at = new Date(iso);
  const month = at.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const time = at.toISOString().slice(11, 16);
  return `${month} ${at.getUTCDate()}, ${time} UTC`;
};

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? '' : 's'}`;

const CI_WORDS: Record<CiState, string> = {
  green: 'CI green',
  red: '🔴 CI red',
  running: '⏳ CI running',
  none: 'no CI yet',
};

const describeStanding = (session: Session) => {
  if (session.key === 'none') return 'nobody is driving these';
  const standing = getStanding(session);
  const count = ownerCount(session);
  if (standing === 'needsYou')
    return `🚩 ${count} need${count === 1 ? 's' : ''} you`;
  if (standing === 'needsFixing') return '🔴 being fixed';
  if (standing === 'inProgress') return '⏳ in progress';
  return '✅ nothing needs you';
};

const isStacked = (session: Session) =>
  session.prs.some((pr) => session.prs.some((other) => other.head === pr.base));

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Markdown for the switchboard list; HTML inside a `<summary>`, where GitHub renders no markdown. */
const switchboardLine = (session: Session, isHtml = false) => {
  const title = escapeHtml(session.title);
  const link = isHtml
    ? `<a href="${session.url}">${title}</a>`
    : `[${title}](${session.url})`;
  const name = session.url ? link : title;
  const prs = `${plural(session.prs.length, 'PR')}${isStacked(session) ? ' (stacked)' : ''}`;
  const ci = session.prs.some((pr) => pr.ci === 'red')
    ? CI_WORDS.red
    : session.prs.some((pr) => pr.ci === 'running')
      ? CI_WORDS.running
      : session.prs.every((pr) => pr.ci === 'green')
        ? CI_WORDS.green
        : '';
  return [
    isHtml ? `<b>${name}</b>` : `**${name}**`,
    describeStanding(session),
    prs,
    ci,
    `updated ${formatWhen(latestUpdate(session))}`,
  ]
    .filter(Boolean)
    .join(' · ');
};

const prLine = (pr: InboxPr, all: readonly InboxPr[]) => {
  const flags = [
    pr.isDraft ? 'draft' : '',
    CI_WORDS[pr.ci],
    pr.labels.includes('merge-conflict') ? '⚠️ merge conflict' : '',
    pr.labels.includes('behind-base') ? 'behind its base' : '',
  ].filter(Boolean);
  const outside = all.find((other) => other.head === pr.base);
  const onTop = outside ? ` · on top of #${outside.number}` : '';
  const state = pr.status?.state ? ` · ${pr.status.state}` : '';
  return `[#${pr.number}](${pr.url}) ${pr.title}${state} · ${flags.join(' · ')}${onTop}`;
};

/** The session's PRs as nested bullets: each under the PR whose branch it targets, so the merge order reads top down. */
const stackTree = (session: Session, all: readonly InboxPr[]): string[] => {
  const heads = new Set(session.prs.map((pr) => pr.head));
  const childrenOf = (head: string) =>
    session.prs
      .filter((pr) => pr.base === head)
      .sort((a, b) => a.number - b.number);
  const draw = (pr: InboxPr, depth: number): string[] => [
    `${'  '.repeat(depth)}- ${prLine(pr, depth === 0 ? all : [])}`,
    ...childrenOf(pr.head).flatMap((child) => draw(child, depth + 1)),
  ];
  return session.prs
    .filter((pr) => !heads.has(pr.base))
    .sort((a, b) => a.number - b.number)
    .flatMap((pr) => draw(pr, 0));
};

const sessionBlock = (session: Session, all: readonly InboxPr[]): string[] => {
  const needs = session.prs.flatMap((pr) =>
    (pr.status?.ownerItems ?? []).map(
      (item) => `- [#${pr.number}](${pr.url}) ${item}`,
    ),
  );
  const shots = session.prs.flatMap((pr) =>
    (pr.status?.screenshots ?? []).map(
      (src) =>
        `<a href="${pr.url}"><img src="${src}" width="120" alt="#${pr.number}"></a>`,
    ),
  );
  const notes = session.prs.flatMap((pr) =>
    (pr.status?.goodToKnow ?? []).map((note) => `- #${pr.number}: ${note}`),
  );
  const isOpen = getStanding(session) === 'needsYou';
  return [
    `<details${isOpen ? ' open' : ''}><summary>${switchboardLine(session, true)}</summary>`,
    '',
    ...(needs.length > 0 ? ['**🚩 Needs you**', ...needs, ''] : []),
    '**Where it stands**',
    ...stackTree(session, all),
    '',
    ...(shots.length > 0
      ? ['**New screenshots**', '', shots.join(' '), '']
      : []),
    ...(notes.length > 0
      ? [
          '<details><summary>⚠️ Good to know</summary>',
          '',
          ...notes,
          '',
          '</details>',
          '',
        ]
      : []),
    '</details>',
    '',
  ];
};

/** Groups open PRs by the session that drives them, sessions that need the owner first. */
export function groupSessions(prs: readonly InboxPr[]): Session[] {
  const sorted = [...prs].sort((a, b) => a.number - b.number);
  const sessions = sorted.reduce<Map<string, Session>>((acc, pr) => {
    const key = pr.status
      ? (pr.status.sessionUrl ?? pr.bodySessionUrl ?? 'none')
      : 'none';
    const found = acc.get(key);
    const title =
      pr.status?.sessionTitle ??
      found?.title ??
      (key === 'none' ? 'Without a status comment' : pr.title);
    return new Map(acc).set(key, {
      key,
      title,
      url: key === 'none' ? null : key,
      prs: [...(found?.prs ?? []), pr],
    });
  }, new Map());
  return [...sessions.values()].sort(
    (a, b) =>
      Number(a.key === 'none') - Number(b.key === 'none') ||
      STANDING_ORDER.indexOf(getStanding(a)) -
        STANDING_ORDER.indexOf(getStanding(b)) ||
      (latestUpdate(b) > latestUpdate(a) ? 1 : -1),
  );
}

/** The inbox issue's body: a one-line switchboard per session, then one folded section per session. */
export function buildInbox(prs: readonly InboxPr[], now: string): string {
  const sessions = groupSessions(prs);
  const total = sessions.reduce((sum, session) => sum + ownerCount(session), 0);
  const headline =
    total === 0
      ? '✅ Nothing is waiting on you.'
      : `🚩 ${plural(total, 'thing')} need${total === 1 ? 's' : ''} you, across ${plural(
          sessions.filter((session) => ownerCount(session) > 0).length,
          'session',
        )}.`;
  return [
    INBOX_MARKER,
    `## 📥 ${headline}`,
    '',
    ...sessions.map((session) => `- ${switchboardLine(session)}`),
    '',
    '---',
    '',
    ...sessions.flatMap((session) => sessionBlock(session, prs)),
    `<sub>Rebuilt ${formatWhen(now)} from each open PR's 📋 Status comment by \`owner-inbox.yml\`. Don't edit by hand.</sub>`,
  ].join('\n');
}
