export const STATUS_MARKER = '<!-- pr-status -->';
export const INBOX_MARKER = '<!-- owner-inbox -->';
const SESSION_MARKER =
  /<!--\s*session:\s*(https:\/\/claude\.ai\/code\/session_[A-Za-z0-9]+)\s*-->/;
const MAX_BODY = 60_000;
const MAX_SHOTS = 8;
const MAX_NOTES = 6;

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
    [
      'failure',
      'timed_out',
      'action_required',
      'startup_failure',
      'cancelled',
      'stale',
    ].includes(run.conclusion ?? '');
  if (latest.some(isFailed)) return 'red';
  return latest.some((run) => run.status !== 'completed') ? 'running' : 'green';
}

export interface OwnerItem {
  /** The question or step, in the person's words. */
  text: string;
  /** The options on the lines indented under it, each with its words and its screenshots, so the question and the screens it is about sit together. */
  options: { label: string; images: string[] }[];
}

const IMAGE_URL = /https:\/\/[^\s)"'<>`]+/g;

const MAX_OPTIONS = 6;
const isImage = (url: string) => /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url);

const toOption = (line: string) => {
  const unlinked = line.replace(/\[([^\]]*)\]\((https:[^)\s]+)\)/g, '$1 $2');
  const urls = (unlinked.match(IMAGE_URL) ?? []).map((url) =>
    url.replace(/[.,;:!\\]+$/, ''),
  );
  const links = urls
    .filter((url) => !isImage(url))
    .map((url) => ` ([link](${url}))`)
    .join('');
  const words = toPlain(
    unlinked
      .replace(IMAGE_URL, '')
      .replace(/^\s*[-*]\s+/, '')
      .replace(/\s+/g, ' ')
      .replace(/[\s:]+$/, '')
      .trim(),
  );
  const images = urls.filter(isImage);
  const label = `${words}${links}`;
  return images.length > 0 || label ? [{ label, images }] : [];
};

export interface PrStatus {
  sessionUrl: string | null;
  sessionTitle: string | null;
  /** The word after "Status ·" in the heading: ready to merge, blocked, in progress. */
  state: string | null;
  ownerItems: OwnerItem[];
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

/** Text from a comment, made safe to place in markdown: no HTML, and no @mention that would ping someone on every rebuild. */
export const toPlain = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/@(?=\w)/g, '@\u200b');

const bullet = (line: string) =>
  toPlain(
    line
      .replace(/^\s*[-*]\s+(\[[ xX]\]\s+)?/, '')
      .replace(/\s*\(who:[^)]*\)/i, '')
      .trim(),
  );

const isOpenBox = (line: string) => /^\s*[-*]\s+\[ \]/.test(line);
const isForOwner = (line: string) =>
  (line.match(/\(who:([^)]*)\)/i)?.[1] ?? '')
    .split(/[,/]/)
    .some((who) => who.trim().toLowerCase() === 'owner');

/** Reads a PR's `📋 Status` comment: its session, state, unchecked owner items, good-to-know notes and latest screenshots. */
export function parseStatus(body: string, updatedAt: string): PrStatus {
  const sessionUrl = body.match(SESSION_MARKER)?.[1] ?? null;
  const titleLine = lines(body).find((line) =>
    /^\s*\*\*Session:\*\*/.test(line),
  );
  const sessionTitle = titleLine
    ? toPlain(titleLine.replace(/^\s*\*\*Session:\*\*\s*/, '').trim()) || null
    : null;
  const heading = lines(body).find((line) => /^##\s+📋\s*Status/.test(line));
  const state = toPlain(heading?.split('·')[1]?.trim() ?? '') || null;
  const all = lines(body);
  const ownerItems = all.flatMap((line, index): OwnerItem[] => {
    if (!isOpenBox(line) || !isForOwner(line)) return [];
    const depth = line.search(/\S/);
    const after = all.slice(index + 1);
    const end = after.findIndex(
      (next) =>
        next.trim() === '' || next.search(/\S/) <= depth || isOpenBox(next),
    );
    const nested = end === -1 ? after : after.slice(0, end);
    return [
      {
        text: bullet(line),
        options: nested.flatMap(toOption).slice(0, MAX_OPTIONS),
      },
    ];
  });
  const goodToKnow = section(body, 'Good to know')
    .filter((line) => /^\s*[-*]\s+/.test(line))
    .map(bullet);
  const screenshots = section(body, 'New screenshots')
    .join(' ')
    .match(IMAGE_URL);
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

const escapeBrackets = (text: string) => text.replace(/[[\]]/g, '\\$&');
const linkText = (text: string) => escapeBrackets(toPlain(text));

/** Markdown for the switchboard list; HTML inside a `<summary>`, where GitHub renders no markdown. */
const switchboardLine = (session: Session, isHtml = false) => {
  const title = session.title;
  const link = isHtml
    ? `<a href="${session.url}">${title}</a>`
    : `[${escapeBrackets(title)}](${session.url})`;
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
  return `[#${pr.number}](${pr.url}) ${linkText(pr.title)}${state} · ${flags.join(' · ')}${onTop}`;
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
    (pr.status?.ownerItems ?? []).flatMap((item) => [
      `- [#${pr.number}](${pr.url}) ${item.text}`,
      ...item.options.map(
        (option) =>
          `  - ${option.label}${option.images
            .slice(0, MAX_SHOTS)
            .map(
              (src) =>
                `<br><a href="${src}"><img src="${src}" width="160"></a>`,
            )
            .join('')}`,
      ),
    ]),
  );
  const allShots = session.prs.flatMap((pr) =>
    (pr.status?.screenshots ?? []).map(
      (src) =>
        `<a href="${pr.url}"><img src="${src}" width="120" alt="#${pr.number}"></a>`,
    ),
  );
  const shots = allShots.slice(0, MAX_SHOTS);
  const allNotes = session.prs.flatMap((pr) =>
    (pr.status?.goodToKnow ?? []).map((note) => `- #${pr.number}: ${note}`),
  );
  const notes = [
    ...allNotes.slice(0, MAX_NOTES),
    ...(allNotes.length > MAX_NOTES
      ? [
          `- and ${allNotes.length - MAX_NOTES} more in the PRs' status comments`,
        ]
      : []),
  ];
  const isOpen = getStanding(session) === 'needsYou';
  return [
    `<details${isOpen ? ' open' : ''}><summary>${switchboardLine(session, true)}</summary>`,
    '',
    ...(needs.length > 0 ? ['**🚩 Needs you**', ...needs, ''] : []),
    '**Where it stands**',
    ...stackTree(session, all),
    '',
    ...(shots.length > 0
      ? [
          '**New screenshots**',
          '',
          shots.join(' '),
          ...(allShots.length > MAX_SHOTS
            ? ['', `and ${allShots.length - MAX_SHOTS} more in the PRs`]
            : []),
          '',
        ]
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
      (key === 'none' ? 'Without a status comment' : toPlain(pr.title));
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
      latestUpdate(b).localeCompare(latestUpdate(a)) ||
      a.key.localeCompare(b.key),
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
  const footer = `<sub>Rebuilt ${formatWhen(now)} from each open PR's 📋 Status comment by \`owner-inbox.yml\`. Don't edit by hand.</sub>`;
  const top = [
    INBOX_MARKER,
    `## 📥 ${headline}`,
    '',
    ...sessions.map((session) => `- ${switchboardLine(session)}`),
    '',
    '---',
    '',
  ];
  // GitHub refuses an issue body over 65,536 characters, so whole sessions that don't fit are left out, never cut mid-block.
  const blocks = sessions.map((session) =>
    sessionBlock(session, prs).join('\n'),
  );
  const kept = blocks.reduce<string[]>(
    (acc, block) =>
      [...top, ...acc, block, footer].join('\n').length > MAX_BODY
        ? acc
        : [...acc, block],
    [],
  );
  const dropped =
    blocks.length > kept.length
      ? [
          `${plural(blocks.length - kept.length, 'more session')} didn't fit; open the PRs list.`,
          '',
        ]
      : [];
  return [...top, ...kept, ...dropped, footer].join('\n');
}
