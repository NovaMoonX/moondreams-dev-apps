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
  isMulti: boolean;
  /** A step for the owner to do and tick off rather than a question to answer: tagged `(to do)`, or a line with no options and no question mark. */
  isTask: boolean;
  /** Ticked from the dashboard (its `(owner: …)` note), shown with an Undo; null while it waits on the owner. */
  settled: 'done' | 'skipped' | null;
}

/** A pull request merged lately, so the dashboard stops showing what its session raised before the merge. */
export interface MergedPr {
  number: number;
  sessionUrl: string | null;
  mergedAt: string;
  title: string | null;
  /** When its status comment was last edited, so an answer sent after it is known to have read it. */
  statusAt: string | null;
  /** The status comment's decisions and follow-ups, still the owner's to change after the merge. */
  decisions: string[];
  followUps: string[];
}

/** A merged PR with the lists from its last status comment (empty when it has none). */
export function toMergedPr(
  pull: {
    number: number;
    title: string;
    body: string | null;
    merged_at: string;
  },
  status: { body: string; updated_at: string } | null,
): MergedPr {
  const parsed = status ? parseStatus(status.body, status.updated_at) : null;
  return {
    number: pull.number,
    sessionUrl: findSessionLink(pull.body),
    mergedAt: pull.merged_at,
    title: toPlain(pull.title),
    statusAt: parsed ? parsed.updatedAt : null,
    decisions: parsed?.decisions ?? [],
    followUps: parsed?.followUps ?? [],
  };
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
  /** The open boxes under "Must do before merge", whoever they are for, or null with no such heading: the dashboard's Merge waits on none being left. */
  mustDo: string[] | null;
  goodToKnow: string[];
  /** The calls a session made on the owner's behalf, under "Decisions I made for you": one line each, with the other option. */
  decisions: string[];
  /** Work the session suggests under "Possible follow-ups", one line each. */
  followUps: string[];
  screenshots: string[];
  updatedAt: string;
}

export interface GalleryImage {
  src: string;
  role: 'before' | 'after' | null;
}

export interface GalleryStep {
  label: string;
  /** A line under the title, written after `<br>` or ` — ` in the label (`**Undo** — the row's sheet holds it`). */
  note: string | null;
  images: GalleryImage[];
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
  gallery: GalleryStep[];
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

const PICK_ANY = /\s*\(pick any\)/i;
const TO_DO = /\s*\(to do\)/i;
const OWNER_NOTE = /\s*\(owner:[^)]*\)/gi;

const bullet = (line: string) =>
  toPlain(
    line
      .replace(/^\s*[-*]\s+(\[[ xX]\]\s+)?/, '')
      .replace(/\s*\(who:[^)]*\)/i, '')
      .replace(PICK_ANY, '')
      .replace(TO_DO, '')
      .trim(),
  );

const isOpenBox = (line: string) => /^\s*[-*]\s+\[ \]/.test(line);
const getOwnerNote = (line: string): OwnerItem['settled'] => {
  if (!/^\s*[-*]\s+\[[xX]\]/.test(line)) return null;
  if (/\(owner:\s*done\)/i.test(line)) return 'done';
  return /\(owner:\s*not doing it\)/i.test(line) ? 'skipped' : null;
};
const isOwnerBox = (line: string) =>
  isOpenBox(line) || getOwnerNote(line) !== null;
const isForOwner = (line: string) =>
  (line.match(/\(who:([^)]*)\)/i)?.[1] ?? '')
    .split(/[,/]/)
    .some((who) => who.trim().toLowerCase() === 'owner');

/** Reads a PR's `📋 Status` comment: its session, state, owner items (unchecked, or ticked from the dashboard), good-to-know notes and latest screenshots. */
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
    if (!isOwnerBox(line) || !isForOwner(line)) return [];
    const depth = line.search(/\S/);
    const after = all.slice(index + 1);
    const end = after.findIndex(
      (next) =>
        next.trim() === '' || next.search(/\S/) <= depth || isOwnerBox(next),
    );
    const nested = end === -1 ? after : after.slice(0, end);
    const text = bullet(line.replace(OWNER_NOTE, ''));
    const options = nested.flatMap(toOption).slice(0, MAX_OPTIONS);
    return [
      {
        text,
        options,
        isMulti: PICK_ANY.test(line),
        isTask:
          TO_DO.test(line) || (options.length === 0 && !text.includes('?')),
        settled: getOwnerNote(line),
      },
    ];
  });
  const hasMustDo = all.some((line) =>
    /^\s*\*\*must do before merge/i.test(line),
  );
  const mustDo = hasMustDo
    ? section(body, 'Must do before merge')
        .filter(isOpenBox)
        .map((line) => bullet(line.replace(OWNER_NOTE, '')))
    : null;
  const goodToKnow = section(body, 'Good to know')
    .filter((line) => /^\s*[-*]\s+/.test(line))
    .map(bullet);
  const decisions = section(body, 'Decisions I made for you')
    .filter((line) => /^\s*[-*]\s+/.test(line))
    .map(bullet);
  const followUps = section(body, 'Possible follow-ups')
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
    mustDo,
    goodToKnow,
    decisions,
    followUps,
    screenshots: screenshots ?? [],
    updatedAt,
  };
}

const BOX_LINE = /^(\s*[-*]\s+)\[([ xX])\]\s+(.*?)\r?$/;

/** An owner line's identity across rewrites: its words without the box, the tags or the owner's note, in lower case. */
export const toItemKey = (line: string) =>
  line
    .replace(/^\s*[-*]\s+(\[[ xX]\]\s+)?/, '')
    .replace(/\s*\(who:[^)]*\)/gi, '')
    .replace(PICK_ANY, '')
    .replace(TO_DO, '')
    .replace(OWNER_NOTE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!]+$/, '')
    .toLowerCase();

const toOwnerBox = (line: string, index: number) => {
  const match = BOX_LINE.exec(line);
  if (!match || !isForOwner(line)) return [];
  return [
    {
      index,
      lead: match[1],
      rest: match[3],
      isTicked: match[2] !== ' ',
      key: toItemKey(line),
    },
  ];
};

/**
 * The status comment as just edited, with every owner box that was ticked before and is still listed ticked again.
 * An edit that only unticks one box is the owner changing their mind, and stays.
 */
export function keepOwnerTicks(before: string, after: string): string {
  const old = before.split('\n');
  const next = after.split('\n');
  const ticked = new Map(
    old
      .flatMap(toOwnerBox)
      .filter((box) => box.isTicked)
      .map((box) => [box.key, box] as const),
  );
  if (ticked.size === 0) return after;
  const changed = next.flatMap((line, index) =>
    line === old[index] ? [] : [index],
  );
  const isOwnUntick =
    old.length === next.length &&
    changed.length === 1 &&
    toOwnerBox(old[changed[0]], 0).some((box) => box.isTicked) &&
    [
      old[changed[0]].replace(/\[[xX]\]/, '[ ]'),
      // The dashboard's Undo also takes off the note it wrote.
      old[changed[0]].replace(/\[[xX]\]/, '[ ]').replace(OWNER_NOTE, ''),
    ].includes(next[changed[0]]);
  if (isOwnUntick) return after;
  return next
    .map((line, index) => {
      const [box] = toOwnerBox(line, index);
      const kept = box && !box.isTicked ? ticked.get(box.key) : undefined;
      if (!kept) return line;
      const ending = line.endsWith('\r') ? '\r' : '';
      return `${box.lead}[x] ${kept.rest}${ending}`;
    })
    .join('\n');
}

const MAX_STEPS = 30;
const MAX_STEP_IMAGES = 3;
const MAX_LABEL = 120;
const MARKDOWN_IMAGE = /!\[[^\]]*\]\((https:\/\/(?:[^\s()]|\([^\s()]*\))+)\)/g;
const HTML_IMAGE = /<img[^>]*\bsrc=(?:"([^"\s]+)"|'([^'\s]+)'|([^\s>"']+))/gi;
const MARKUP_TAG =
  /<\/?(?:br|img|b|i|em|strong|code|details|summary|a|span|p)\b[^>]*>/gi;

const toImageUrls = (cell: string) =>
  [
    ...[...cell.matchAll(MARKDOWN_IMAGE)].map((match) => ({
      at: match.index ?? 0,
      src: match[1],
    })),
    ...[...cell.matchAll(HTML_IMAGE)].map((match) => ({
      at: match.index ?? 0,
      src: match[1] ?? match[2] ?? match[3],
    })),
  ]
    .filter((image) => image.src.startsWith('https://'))
    .sort((a, b) => a.at - b.at)
    .map((image) => image.src);

const ROLE_RANK = { before: 0, none: 1, after: 2 } as const;

// A shot whose column doesn't say still says in its file name (`history-mobile-before.png`).
const getFileRole = (src: string): GalleryImage['role'] => {
  const name = src.split('?')[0].split('/').pop() ?? '';
  if (/(^|[-_.])before([-_.]|$)/i.test(name)) return 'before';
  if (/(^|[-_.])after([-_.]|$)/i.test(name)) return 'after';
  return null;
};

const toImages = (cell: string, role: GalleryImage['role']): GalleryImage[] =>
  toImageUrls(cell).map((src) => ({ src, role: role ?? getFileRole(src) }));

/** A step's pictures with Before first and After last, whatever order they were written in. */
const toOrdered = (images: GalleryImage[]) =>
  [...images].sort(
    (a, b) => ROLE_RANK[a.role ?? 'none'] - ROLE_RANK[b.role ?? 'none'],
  );

// Cut before escaping, so the cut never lands inside `&amp;`.
const toLabel = (text: string, max = MAX_LABEL) =>
  toPlain(
    text
      .replace(MARKDOWN_IMAGE, '')
      .replace(MARKUP_TAG, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^\s*#+\s*/, '')
      .replace(/\*\*|__|`/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max),
  );

const MAX_NOTE = 240;
const NOTE_BREAK = /<br\s*\/?>|\s+—\s+/i;

/** A label and the note written after its first `<br>`, or after ` — ` when the label is bold (a plain dash is punctuation). */
const toTitled = (raw: string) => {
  const isBold = /^\s*(\*\*|__|<b>)/i.test(raw);
  const at = isBold ? raw.search(NOTE_BREAK) : raw.search(/<br\s*\/?>/i);
  if (at === -1) return { label: toLabel(raw), note: null };
  const rest = raw.slice(at).replace(NOTE_BREAK, '');
  return {
    label: toLabel(raw.slice(0, at)),
    note: toLabel(rest, MAX_NOTE) || null,
  };
};

const toCells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, '|'));

const getRole = (heading: string): GalleryImage['role'] => {
  const word = heading.toLowerCase();
  if (word.includes('before')) return 'before';
  if (word.includes('after')) return 'after';
  return null;
};

const screenshotLines = (body: string) => {
  const all = lines(body);
  const start = all.findIndex((line) => /^##\s+Screenshots\b/i.test(line));
  if (start === -1) return [];
  const rest = all.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line));
  return end === -1 ? rest : rest.slice(0, end);
};

const toRowSteps = (cells: string[], headings: string[]): GalleryStep[] => {
  const [first = '', ...rest] = cells;
  if (toImageUrls(first).length === 0) {
    const images = toOrdered(
      rest.flatMap((cell, index) =>
        toImages(cell, getRole(headings[index + 1] ?? '')),
      ),
    ).slice(0, MAX_STEP_IMAGES);
    const { label, note } = toTitled(first);
    return images.length === 0
      ? []
      : [{ label: label || 'Screenshot', note, images }];
  }
  return cells.flatMap((cell, index) => {
    const images = toImages(cell, getRole(headings[index] ?? ''));
    return images.length === 0
      ? []
      : [
          {
            label: toLabel(headings[index] ?? '') || 'Screenshot',
            note: null,
            images: toOrdered(images).slice(0, MAX_STEP_IMAGES),
          },
        ];
  });
};

/** Every screenshot in a PR body's Screenshots section, in the order written. */
export function parseGallery(body: string | null): GalleryStep[] {
  const result = screenshotLines(body ?? '').reduce<{
    steps: GalleryStep[];
    headings: string[];
    caption: string;
  }>(
    (acc, line) => {
      if (line.trim().startsWith('|')) {
        const cells = toCells(line);
        if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) return acc;
        if (acc.headings.length === 0) return { ...acc, headings: cells };
        return {
          ...acc,
          steps: [...acc.steps, ...toRowSteps(cells, acc.headings)],
        };
      }
      const images = toOrdered(toImages(line, null)).slice(0, MAX_STEP_IMAGES);
      if (images.length > 0) {
        const alt = toLabel(/!\[([^\]]*)\]/.exec(line)?.[1] ?? '');
        const titled = alt ? { label: alt, note: null } : toTitled(acc.caption);
        return {
          steps: [
            ...acc.steps,
            { label: titled.label || 'Screenshot', note: titled.note, images },
          ],
          headings: [],
          caption: '',
        };
      }
      return {
        ...acc,
        headings: [],
        caption: toLabel(line) ? line : acc.caption,
      };
    },
    { steps: [], headings: [], caption: '' },
  );
  return result.steps.slice(0, MAX_STEPS);
}

interface Session {
  key: string;
  title: string;
  url: string | null;
  prs: InboxPr[];
  /** The time the inbox is built for, so a held PR's six hours are counted from one clock. */
  now: number;
}

type Standing = 'needsYou' | 'needsFixing' | 'inProgress' | 'waiting';

const STANDING_ORDER: Standing[] = [
  'needsYou',
  'needsFixing',
  'inProgress',
  'waiting',
];

const HELD_FOR_MS = 6 * 60 * 60 * 1000;

/** A PR whose status says it's still in progress asks nothing yet, for up to six hours since that status. */
export const isStillWorking = (status: PrStatus | null, now = Date.now()) =>
  /^in progress\b/i.test(status?.state ?? '') &&
  now - Date.parse(status?.updatedAt ?? '') <= HELD_FOR_MS;

const waitingItems = (pr: InboxPr, now: number) =>
  isStillWorking(pr.status, now)
    ? []
    : (pr.status?.ownerItems ?? []).filter((item) => item.settled === null);

const ownerCount = (session: Session) =>
  session.prs.reduce(
    (sum, pr) => sum + waitingItems(pr, session.now).length,
    0,
  );

const isBroken = (pr: InboxPr) =>
  pr.ci === 'red' || pr.labels.includes('merge-conflict');

const getStanding = (session: Session): Standing => {
  if (ownerCount(session) > 0) return 'needsYou';
  if (session.prs.some(isBroken)) return 'needsFixing';
  const isMoving = session.prs.some(
    (pr) => pr.ci === 'running' || isStillWorking(pr.status, session.now),
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
    waitingItems(pr, session.now).flatMap((item) => [
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
    (pr.gallery.length > 0
      ? pr.gallery.flatMap((step) =>
          step.images
            .filter((image) => image.role !== 'before')
            .map((image) => image.src),
        )
      : (pr.status?.screenshots ?? [])
    ).map(
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
  const decisions = session.prs.flatMap((pr) =>
    (pr.status?.decisions ?? []).map((line) => `- #${pr.number}: ${line}`),
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
    ...(decisions.length > 0
      ? [
          `<details><summary>Decisions I made for you (${decisions.length})</summary>`,
          '',
          ...decisions,
          '',
          '</details>',
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
export function groupSessions(
  prs: readonly InboxPr[],
  now = Date.now(),
): Session[] {
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
      now,
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
  const sessions = groupSessions(prs, Date.parse(now));
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
