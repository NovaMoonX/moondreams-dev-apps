import { createHash } from 'node:crypto';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  HttpsError,
  onCall,
  type CallableRequest,
} from 'firebase-functions/v2/https';

import { isRunningInEmulator } from '../emulator.js';
import { createOptionalSecretReader } from '../imageSearch/optionalSecret.js';
import type { FetchLike } from '../imageSearch/types.js';

if (getApps().length === 0) {
  initializeApp();
}

const fetchLike: FetchLike = (url, init) => fetch(url, init);
const readSecret = createOptionalSecretReader({ fetch: fetchLike });

const ADMIN_EMAIL = 'nova@moondreams.dev';
const REPO = 'NovaMoonX/moondreams-dev-apps';
const GITHUB_TIMEOUT_MS = 15_000;
const MAX_PRS = 20;
// Up to 20 questions on a pull request, and the dashboard's Anything else box.
const MAX_ITEMS = 21;
const MAX_QUESTION = 500;
const MAX_CHOICE = 300;
const MAX_CHOICES = 26;
const MAX_NOTE = 2000;
const RECENT_COMMENTS_PAGE = 30;
const MAX_COMMENT = 60_000;

interface AnswerItem {
  question: string;
  choices: string[];
  other: string | null;
  note: string | null;
}

interface PrAnswers {
  prNumber: number;
  items: AnswerItem[];
  /** Which of the dashboard's asks these answer: "<pr>:<index>" for a question, "<pr>:reply" for 🚩 lines. */
  marks: string[];
}

interface PrResult {
  prNumber: number;
  ok: boolean;
  url: string | null;
  /** When the comment was posted, in the server's time. */
  postedAt: number | null;
  error: string | null;
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const invalid = (message: string) =>
  new HttpsError('invalid-argument', message);

const readText = (value: unknown, max: number) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > max) {
    throw invalid('An answer is too long or the wrong shape.');
  }
  return value.trim() === '' ? null : value.trim();
};

// A joiner after "<" keeps text from opening a hidden marker of its own.
const neutralise = (value: string | null) =>
  value === null ? null : value.replace(/<!--/g, '<\u200d!--');

const collapse = (value: string | null) =>
  value === null ? null : value.replace(/\s+/g, ' ').trim();

const readChoice = (value: unknown) =>
  neutralise(collapse(readText(value, MAX_CHOICE)));

// A page loaded before the multi-select change still sends one `choice`.
const readChoices = (raw: Json) => {
  if (raw.choices === undefined) {
    const choice = readChoice(raw.choice);
    return choice === null ? [] : [choice];
  }
  if (!Array.isArray(raw.choices) || raw.choices.length > MAX_CHOICES) {
    throw invalid('An answer is too long or the wrong shape.');
  }
  return Array.from(
    new Set(
      raw.choices
        .map(readChoice)
        .filter((choice): choice is string => choice !== null),
    ),
  );
};

const readItem = (raw: unknown): AnswerItem => {
  if (!isObject(raw)) throw invalid('Bad answer.');
  const question = neutralise(collapse(readText(raw.question, MAX_QUESTION)));
  const choices = readChoices(raw);
  const other = neutralise(readText(raw.other, MAX_NOTE));
  const note = neutralise(readText(raw.note, MAX_NOTE));
  if (question === null) throw invalid('Each answer needs its question.');
  if (choices.length === 0 && other === null && note === null) {
    throw invalid('Each answer needs a choice, an answer or a note.');
  }
  return { question, choices, other, note };
};

const ATTEMPT = /^[A-Za-z0-9_-]{8,64}$/;
const SEND_AT_ONCE = 4;

const readAttempt = (data: unknown) => {
  const attempt = isObject(data) ? data.attempt : null;
  if (typeof attempt !== 'string' || !ATTEMPT.test(attempt)) {
    throw invalid('Bad send key.');
  }
  return attempt;
};

const readMarks = (raw: unknown, prNumber: number) => {
  if (raw === undefined) return [];
  const mark = new RegExp(`^${prNumber}:(\\d{1,2}|reply)$`);
  if (
    !Array.isArray(raw) ||
    raw.length > MAX_ITEMS ||
    raw.some((value) => typeof value !== 'string' || !mark.test(value))
  ) {
    throw invalid('Bad answer marks.');
  }
  return Array.from(new Set(raw as string[]));
};

const readAnswers = (data: unknown): PrAnswers[] => {
  if (!isObject(data) || !Array.isArray(data.answers)) {
    throw invalid('Bad request.');
  }
  if (data.answers.length === 0 || data.answers.length > MAX_PRS) {
    throw invalid('Send between 1 and 20 pull requests.');
  }
  return data.answers.map((raw: unknown) => {
    if (!isObject(raw)) throw invalid('Bad pull request.');
    const { prNumber, items } = raw;
    if (
      typeof prNumber !== 'number' ||
      !Number.isInteger(prNumber) ||
      prNumber <= 0
    ) {
      throw invalid('Bad pull request number.');
    }
    if (
      !Array.isArray(items) ||
      items.length === 0 ||
      items.length > MAX_ITEMS
    ) {
      throw invalid('Send between 1 and 21 answers per pull request.');
    }
    const answer = {
      prNumber,
      items: items.map(readItem),
      marks: readMarks(raw.marks, prNumber),
    };
    if (toCommentBody(answer.items, '').length > MAX_COMMENT) {
      throw invalid(`Your answers for #${prNumber} are too long for one comment.`);
    }
    return answer;
  });
};

// A zero-width joiner after "@" keeps a stray name from pinging anyone.
const defang = (value: string) => value.replace(/@/g, '@‍');

// The send's key is in the hash, so a retry of one send is skipped but the same answers sent again later are posted.
const toMarker = (attempt: string, items: AnswerItem[]) =>
  `<!-- pipeline-answer:${createHash('sha256').update(JSON.stringify({ attempt, items })).digest('hex').slice(0, 16)} -->`;

const isBusy = (response: Response) =>
  response.status === 429 ||
  (response.status === 403 &&
    (response.headers.has('retry-after') ||
      response.headers.get('x-ratelimit-remaining') === '0'));

const BUSY = 'GitHub is busy right now. Try again in a minute.';

const indent = (value: string) => defang(value).replace(/\n/g, '\n  ');

const toAnswerText = ({ choices, other }: AnswerItem) =>
  [
    ...choices.map(defang),
    ...(other === null
      ? []
      : [choices.length > 0 ? `Other: ${indent(other)}` : indent(other)]),
  ].join('; ');

const toCommentBody = (items: AnswerItem[], marker: string) => {
  const lines = items.flatMap((item) => {
    const answer = toAnswerText(item);
    const heading = `- **${defang(item.question)}**`;
    if (answer === '') {
      return [`${heading} ${item.note === null ? '' : indent(item.note)}`];
    }
    return [
      `${heading} ${answer}`,
      ...(item.note === null ? [] : [`  Note: ${indent(item.note)}`]),
    ];
  });
  return [marker, '**Answers from the admin dashboard**', '', ...lines].join(
    '\n',
  );
};

const TOKEN_PAGE = 'https://github.com/settings/personal-access-tokens';

const toPermissionWords = (pair: string) => {
  const [name, level] = pair.trim().split('=');
  if (!name || !level) return [];
  const label = name.replace(/_/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase());
  return [`${label}: ${level === 'write' ? 'Read and write' : 'Read-only'}`];
};

// The header lists sets that each suffice, split by ";", and the permissions a set needs together, split by ",".
const toPermissionFix = (needed: string | null) => {
  const sets = (needed ?? '')
    .split(';')
    .map((set) => Array.from(new Set(set.split(',').flatMap(toPermissionWords))))
    .filter((set) => set.length > 0)
    .map((set) => set.join(' and '));
  if (sets.length === 0) {
    return 'Give it Pull requests: Read and write and Issues: Read and write';
  }
  return `Give it ${sets.join(', or ')}`;
};

// A fine-grained token refused for a missing permission names what it needs in this header.
const toRefusal = async (response: Response, action: string) => {
  const needed = response.headers.get('x-accepted-github-permissions');
  const body = await readJson(response);
  logger.warn('answerPipelineQuestions: token refused', {
    status: response.status,
    needed,
    message: typeof body?.message === 'string' ? body.message : null,
  });
  if (response.status === 401) {
    return 'GitHub says the token has expired or was revoked. Run npm run pipeline:secrets -- token to make a new one.';
  }
  const fix = toPermissionFix(needed);
  return `The token can't ${action}. ${fix} on ${TOKEN_PAGE} (edit the Pipeline answers token; no new token needed), then send again.`;
};

const forgetAndRefuse = (response: Response, action: string) => {
  readSecret.forget('PIPELINE_GITHUB_TOKEN');
  return toRefusal(response, action);
};

// The dashboard stops showing an ask as waiting once it was answered after the status that raised it.
const recordAnswered = async (answers: PrAnswers[], results: PrResult[]) => {
  const marks = results
    .filter((result) => result.ok && result.postedAt !== null)
    .flatMap((result) =>
      (answers.find((answer) => answer.prNumber === result.prNumber)?.marks ?? []).map(
        (mark) => [mark, result.postedAt] as const,
      ),
    );
  if (marks.length === 0) return;
  try {
    await getFirestore()
      .doc('pipeline/answered')
      .set(
        { marks: Object.fromEntries(marks), updatedAt: Date.now() },
        { merge: true },
      );
  } catch (error) {
    logger.error('answerPipelineQuestions: answered mark failed', getErrorName(error));
  }
};

const githubFetch = (token: string, path: string, init?: RequestInit) =>
  fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
  });

const readJson = async (response: Response): Promise<Json | null> => {
  try {
    const body: unknown = await response.json();
    return isObject(body) ? body : null;
  } catch {
    return null;
  }
};

const getErrorName = (error: unknown) =>
  error instanceof Error ? error.name : 'unknown';

/** The newest comments on a pull request: GitHub lists oldest first, so the last page (and the one before it when it is short) holds them. */
const readRecentComments = async (
  token: string,
  prNumber: number,
  commentCount: number,
) => {
  const lastPage = Math.max(1, Math.ceil(commentCount / RECENT_COMMENTS_PAGE));
  const pages = lastPage > 1 ? [lastPage - 1, lastPage] : [lastPage];
  const responses = await Promise.all(
    pages.map((page) =>
      githubFetch(
        token,
        `/issues/${prNumber}/comments?per_page=${RECENT_COMMENTS_PAGE}&page=${page}`,
      ),
    ),
  );
  if (!responses.every((response) => response.ok)) return null;
  const bodies = await Promise.all(
    responses.map(async (response) => {
      try {
        const body: unknown = await response.json();
        return Array.isArray(body) ? body : [];
      } catch {
        return [];
      }
    }),
  );
  return bodies.flat().filter(isObject);
};

const postAnswers = async (
  token: string,
  attempt: string,
  { prNumber, items }: PrAnswers,
): Promise<PrResult> => {
  const fail = (error: string): PrResult => ({
    prNumber,
    ok: false,
    url: null,
    postedAt: null,
    error,
  });
  const marker = toMarker(attempt, items);
  try {
    const pull = await githubFetch(token, `/pulls/${prNumber}`);
    if (pull.status === 404) return fail("That pull request doesn't exist.");
    if (!pull.ok) {
      logger.warn('answerPipelineQuestions: read failed', pull.status);
      if (isBusy(pull)) return fail(BUSY);
      return fail(
        pull.status === 401 || pull.status === 403
          ? await forgetAndRefuse(pull, 'read this pull request')
          : "Couldn't reach that pull request.",
      );
    }
    const pullBody = await readJson(pull);
    if (pullBody?.state !== 'open') {
      return fail('That pull request is already closed.');
    }

    const recent = await readRecentComments(
      token,
      prNumber,
      typeof pullBody.comments === 'number' ? pullBody.comments : 0,
    );
    if (recent === null) return fail("Couldn't reach that pull request.");
    const earlier = recent.find(
      (comment) =>
        typeof comment.body === 'string' && comment.body.includes(marker),
    );
    if (earlier) {
      const created = Date.parse(String(earlier.created_at));
      return {
        prNumber,
        ok: true,
        url: typeof earlier.html_url === 'string' ? earlier.html_url : null,
        postedAt: Number.isNaN(created) ? Date.now() : created,
        error: null,
      };
    }

    const comment = await githubFetch(token, `/issues/${prNumber}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: toCommentBody(items, marker) }),
    });
    if (!comment.ok) {
      logger.warn('answerPipelineQuestions: post failed', comment.status);
      if (isBusy(comment)) return fail(BUSY);
      if (comment.status === 401 || comment.status === 403) {
        return fail(await forgetAndRefuse(comment, 'comment on pull requests'));
      }
      return fail("Couldn't post the comment.");
    }
    const posted = await readJson(comment);
    const createdAt = Date.parse(String(posted?.created_at));
    return {
      prNumber,
      ok: true,
      url: typeof posted?.html_url === 'string' ? posted.html_url : null,
      postedAt: Number.isNaN(createdAt) ? Date.now() : createdAt,
      error: null,
    };
  } catch (error) {
    logger.warn('answerPipelineQuestions: request failed', getErrorName(error));
    return fail("Couldn't reach GitHub.");
  }
};

const assertAdmin = (auth: CallableRequest['auth']) => {
  const email = auth?.token.email?.trim().toLowerCase() ?? null;
  const isAdminEmail = email === ADMIN_EMAIL && auth?.token.email_verified === true;
  if (!auth || (!isAdminEmail && auth.token.admin !== true)) {
    throw new HttpsError(
      'permission-denied',
      'Only the admin can answer from the dashboard.',
    );
  }
};

const CALLABLE_OPTIONS = {
  region: 'us-central1',
  maxInstances: 5,
  cors: [
    'https://apps.moondreams.dev',
    /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
  ],
};

export const answerPipelineQuestions = onCall(
  { ...CALLABLE_OPTIONS, timeoutSeconds: 120 },
  async (request) => {
    assertAdmin(request.auth);

    const answers = readAnswers(request.data);
    const attempt = readAttempt(request.data);
    // The emulator's dashboard shows made-up pull requests, so it rehearses the send and posts nothing.
    if (isRunningInEmulator()) {
      const sample = answers.map(
        ({ prNumber }): PrResult => ({
          prNumber,
          ok: true,
          url: null,
          postedAt: Date.now(),
          error: null,
        }),
      );
      await recordAnswered(answers, sample);
      return { isSample: true, results: sample };
    }
    const token = await readSecret(
      'PIPELINE_GITHUB_TOKEN',
      AbortSignal.timeout(10_000),
    );
    if (token === null) {
      throw new HttpsError(
        'failed-precondition',
        "Answering from the dashboard isn't set up yet.",
      );
    }

    // A few at a time: a burst of new comments trips GitHub's secondary rate limit.
    const batches = answers.reduce<PrAnswers[][]>(
      (all, answer, index) =>
        index % SEND_AT_ONCE === 0
          ? [...all, [answer]]
          : [...all.slice(0, -1), [...all[all.length - 1], answer]],
      [],
    );
    const settled = await batches.reduce<
      Promise<PromiseSettledResult<PrResult>[]>
    >(
      async (done, batch) => [
        ...(await done),
        ...(await Promise.allSettled(
          batch.map((answer) => postAnswers(token, attempt, answer)),
        )),
      ],
      Promise.resolve([]),
    );
    const results = settled.map((outcome, index): PrResult =>
      outcome.status === 'fulfilled'
        ? outcome.value
        : {
            prNumber: answers[index].prNumber,
            ok: false,
            url: null,
            postedAt: null,
            error: "Couldn't reach GitHub.",
          },
    );
    await recordAnswered(answers, results);
    return { isSample: false, results };
  },
);

type Outcome = 'done' | 'skipped' | 'open';

interface SettledAsk {
  /** The pull request whose status comment lists it, or null for a line a session raised in chat. */
  prNumber: number | null;
  sessionId: string | null;
  /** The ask's words exactly as the dashboard showed them. */
  text: string;
  outcome: Exclude<Outcome, 'open'>;
  at: number;
}

const OUTCOMES: Outcome[] = ['done', 'skipped', 'open'];
const OWNER_NOTES: Record<Outcome, string> = {
  done: ' (owner: done)',
  skipped: ' (owner: not doing it)',
  open: '',
};
const MAX_SETTLED = 300;
const MAX_STATUS_PAGES = 5;
const STATUS_MARKER = '<!-- pr-status -->';
const TRUSTED = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const SESSION_ID = /^[A-Za-z0-9_-]{1,80}$/;
const BOX_LINE = /^(\s*[-*]\s+)\[([ xX])\]\s+(.*?)(\r?)$/;

// The same reading of an owner line as the inbox builder's `toItemKey`, so a rewrite with the same words still matches.
const toItemKey = (line: string) =>
  line
    .replace(/^\s*[-*]\s+(\[[ xX]\]\s+)?/, '')
    .replace(/\s*\(who:[^)]*\)/gi, '')
    .replace(/\s*\(pick any\)/i, '')
    .replace(/\s*\(to do\)/i, '')
    .replace(/\s*\(owner:[^)]*\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!]+$/, '')
    .toLowerCase();

const isForOwner = (line: string) =>
  (line.match(/\(who:([^)]*)\)/i)?.[1] ?? '')
    .split(/[,/]/)
    .some((who) => who.trim().toLowerCase() === 'owner');

const readSettle = (data: unknown) => {
  if (!isObject(data)) throw invalid('Bad request.');
  const { prNumber, sessionId, outcome } = data;
  // As long as the inbox lets an owner line be.
  const text = readText(data.text, 1000);
  if (text === null) throw invalid('Say which ask this is.');
  if (typeof outcome !== 'string' || !OUTCOMES.includes(outcome as Outcome)) {
    throw invalid('Bad outcome.');
  }
  const isPr =
    typeof prNumber === 'number' && Number.isInteger(prNumber) && prNumber > 0;
  const isSession = typeof sessionId === 'string' && SESSION_ID.test(sessionId);
  if (isPr === isSession) throw invalid('Name a pull request or a session.');
  return {
    prNumber: isPr ? prNumber : null,
    sessionId: isSession ? sessionId : null,
    text,
    outcome: outcome as Outcome,
  };
};

/** The status comment with the owner's line for `text` ticked with a note, or unticked; null when no such line is left. */
const toSettledBody = (body: string, text: string, outcome: Outcome) => {
  const key = toItemKey(text);
  const lines = body.split('\n');
  const index = lines.findIndex(
    (line) => BOX_LINE.test(line) && isForOwner(line) && toItemKey(line) === key,
  );
  if (index === -1) return null;
  const [, lead, , rest, ending] = BOX_LINE.exec(lines[index]) ?? [];
  const words = rest.replace(/\s*\(owner:[^)]*\)/gi, '');
  const box = outcome === 'open' ? '[ ]' : '[x]';
  return lines
    .map((line, at) =>
      at === index ? `${lead}${box} ${words}${OWNER_NOTES[outcome]}${ending}` : line,
    )
    .join('\n');
};

const findStatusComment = async (token: string, prNumber: number, page = 1): Promise<Json | null> => {
  const response = await githubFetch(
    token,
    `/issues/${prNumber}/comments?per_page=100&page=${page}`,
  );
  if (!response.ok) throw response;
  const body: unknown = await response.json();
  const comments = (Array.isArray(body) ? body : []).filter(isObject);
  const later =
    comments.length === 100 && page < MAX_STATUS_PAGES
      ? await findStatusComment(token, prNumber, page + 1)
      : null;
  const own = comments.filter(
    (comment) =>
      typeof comment.body === 'string' &&
      comment.body.trimStart().startsWith(STATUS_MARKER) &&
      TRUSTED.has(String(comment.author_association)),
  );
  return later ?? own.at(-1) ?? null;
};

/** Ticks, skips or reopens the owner's line in a pull request's status comment; null when it worked. */
const settleOnGithub = async (
  token: string,
  prNumber: number,
  text: string,
  outcome: Outcome,
): Promise<string | null> => {
  try {
    const comment = await findStatusComment(token, prNumber);
    if (comment === null || typeof comment.body !== 'string') {
      return "That pull request has no status comment any more.";
    }
    const next = toSettledBody(comment.body, text, outcome);
    if (next === null) {
      return 'The session already changed that line. Open the PR to see it.';
    }
    if (next === comment.body) return null;
    const saved = await githubFetch(token, `/issues/comments/${String(comment.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ body: next }),
    });
    if (saved.ok) return null;
    throw saved;
  } catch (error) {
    if (!(error instanceof Response)) {
      logger.warn('settlePipelineAsk: request failed', getErrorName(error));
      return "Couldn't reach GitHub.";
    }
    logger.warn('settlePipelineAsk: GitHub refused', error.status);
    if (isBusy(error)) return BUSY;
    if (error.status === 401 || error.status === 403) {
      return forgetAndRefuse(error, 'edit comments on pull requests');
    }
    return "Couldn't update the status comment.";
  }
};

const isSameAsk = (a: Omit<SettledAsk, 'outcome' | 'at'>) => (b: SettledAsk) =>
  a.prNumber === b.prNumber && a.sessionId === b.sessionId && a.text === b.text;

const recordSettled = async (ask: Omit<SettledAsk, 'outcome' | 'at'>, outcome: Outcome) => {
  const db = getFirestore();
  const ref = db.doc('pipeline/settled');
  const now = Date.now();
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const stored = snapshot.get('asks') as unknown;
    const kept = (Array.isArray(stored) ? (stored as SettledAsk[]) : []).filter(
      (other) => !isSameAsk(ask)(other),
    );
    const asks =
      outcome === 'open' ? kept : [...kept, { ...ask, outcome, at: now }];
    transaction.set(ref, {
      asks: asks.sort((a, b) => b.at - a.at).slice(0, MAX_SETTLED),
      updatedAt: now,
    });
  });
  return now;
};

/** Marks one ask as done or not being done, or opens it again: on GitHub when a status comment lists it, and for the dashboard. */
export const settlePipelineAsk = onCall(
  { ...CALLABLE_OPTIONS, timeoutSeconds: 60 },
  async (request) => {
    assertAdmin(request.auth);
    const { prNumber, sessionId, text, outcome } = readSettle(request.data);
    if (prNumber !== null && !isRunningInEmulator()) {
      const token = await readSecret('PIPELINE_GITHUB_TOKEN', AbortSignal.timeout(10_000));
      if (token === null) {
        throw new HttpsError(
          'failed-precondition',
          "Answering from the dashboard isn't set up yet.",
        );
      }
      const error = await settleOnGithub(token, prNumber, text, outcome);
      if (error !== null) return { ok: false, error, at: null };
    }
    try {
      const at = await recordSettled({ prNumber, sessionId, text }, outcome);
      return { ok: true, error: null, at };
    } catch (error) {
      // GitHub already holds the change, which the next inbox rebuild carries; only a 🚩 line has nothing to fall back on.
      logger.error('settlePipelineAsk: record failed', getErrorName(error));
      if (prNumber === null) throw new HttpsError('internal', "Couldn't save that.");
      return { ok: true, error: null, at: Date.now() };
    }
  },
);

type MergeOutcome = 'asked' | 'merged';

interface MergeView {
  isOpen: boolean;
  labels: string[];
  ci: string;
  /** False when GitHub found a conflict with the base; null while it is still working that out. */
  isMergeable: boolean | null;
  state: string | null;
  /** The open boxes under "Must do before merge": null when that heading is missing, `no status` with no status comment. */
  mustDo: string[] | null | 'no status';
  /** The status heading's short sha is the head's, so its Must do list was written for this commit. */
  isStatusForHead: boolean;
  /** Its base has commits its head doesn't, so its green CI never ran on what would land. */
  isBehind: boolean;
  /** Null while the inbox hasn't read the newest status, so its questions aren't known yet. */
  hasOpenQuestion: boolean | null;
}

const MERGE_COMMENT = 'Merge it (from the admin dashboard)';
const DRIVEN_FOR_MS = 3 * 24 * 60 * 60 * 1000;
const SESSION_MARKER = /<!--\s*session:\s*(https:\/\/claude\.ai\/code\/session_[A-Za-z0-9]+)\s*-->/;
const SESSION_LINK = /https:\/\/claude\.ai\/code\/session_[A-Za-z0-9]+/g;
const DEFAULT_BRANCH = 'main';
const DASHBOARD_HOLDER = 'owner (admin dashboard)';

class ActionsRefused extends Error {}
const DEPLOY_WORKFLOW = 'firebase-hosting-merge.yml';
const LOCK_REF = 'heads/merge-lock';
// Every lock commit carries git's empty tree, so a lock commit needs no files of its own.
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const CI_JOB_LEFT_OUT = 'owner-inbox';
const FAILED_RUNS = ['failure', 'timed_out', 'action_required', 'startup_failure', 'cancelled', 'stale'];
const MAYBE_MERGED = 'It may have merged. Open the pull request to check before trying again.';

// The same wording as the dashboard's disabled button, so a refusal here reads like the reason shown there.
const getMergeRefusal = (view: MergeView) => {
  if (!view.isOpen) return 'That pull request is already closed.';
  if (view.mustDo === 'no status') return 'It has no status comment yet.';
  if (/^in progress\b/i.test(view.state ?? '')) return 'Its session is still working on it.';
  if (view.labels.includes('merge-conflict') || view.isMergeable === false) {
    return 'It conflicts with its base.';
  }
  if (view.labels.includes('behind-base') || view.isBehind) {
    return "It's behind its base. Its session needs to bring it up to date.";
  }
  if (view.ci === 'running') return 'Checks are still running.';
  if (view.ci === 'red') return 'A check failed.';
  if (view.ci !== 'green') return 'No checks have run on it yet.';
  if (view.mustDo === null) return 'Its status has no Must do list yet.';
  if (view.mustDo.length > 0) return 'Must do items are still open.';
  if (view.hasOpenQuestion === null) return "Its newest status hasn't reached the dashboard yet. Try again in a minute.";
  if (view.hasOpenQuestion) return 'It has an open question for you.';
  if (!view.isStatusForHead) return 'Its status is for an older commit. Wait for its session to update it.';
  if (view.isMergeable === null) return 'GitHub is still checking it for conflicts. Try again in a moment.';
  return null;
};

// Fails closed: a status comment whose Must do heading was renamed or dropped is not read as empty.
const readMustDo = (body: string) => {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => /^\s*\*\*must do before merge/i.test(line));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^\s*(\*\*[^*]+\*\*|##)/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).filter((line) => /^\s*[-*]\s+\[ \]/.test(line));
};

const readHeading = (body: string) =>
  body.split(/\r?\n/).find((line) => /^##\s+📋\s*Status/.test(line)) ?? '';

const readState = (body: string) => readHeading(body).split('·')[1]?.trim() ?? null;

const isHeadingFor = (body: string, sha: string) => {
  const short = (readHeading(body).split('·')[2] ?? '').match(/\b[0-9a-f]{7,40}\b/i)?.[0] ?? '';
  return short !== '' && sha.toLowerCase().startsWith(short.toLowerCase());
};

// Each check's latest run counts, so a re-run replaces a failure; the inbox counts them the same way.
const summarizeRuns = (runs: Json[]) => {
  const latest = [
    ...runs
      .filter((run) => run.name !== CI_JOB_LEFT_OUT)
      .reduce<Map<string, Json>>((acc, run) => {
        const kept = acc.get(String(run.name));
        return kept && Number(kept.id) > Number(run.id) ? acc : new Map(acc).set(String(run.name), run);
      }, new Map())
      .values(),
  ];
  if (latest.length === 0) return 'none';
  if (latest.some((run) => FAILED_RUNS.includes(String(run.conclusion)))) return 'red';
  return latest.some((run) => run.status !== 'completed') ? 'running' : 'green';
};

const isDrivenBySession = async (sessionUrl: string | null) => {
  if (sessionUrl === null) return false;
  const sessions = await getFirestore()
    .collection('pipelineSessions')
    .where('url', '==', sessionUrl)
    .get();
  return sessions.docs.some((doc) => {
    const updatedAt = doc.get('updatedAt') as unknown;
    return typeof updatedAt === 'number' && Date.now() - updatedAt <= DRIVEN_FOR_MS;
  });
};

const readMergeRequest = (data: unknown) => {
  const prNumber = isObject(data) ? data.prNumber : null;
  if (typeof prNumber !== 'number' || !Number.isInteger(prNumber) || prNumber <= 0) {
    throw invalid('Bad pull request number.');
  }
  return prNumber;
};

interface MergeResult {
  ok: boolean;
  outcome: MergeOutcome | null;
  url: string | null;
  error: string | null;
  isSample: boolean;
}

const refused = (error: string): MergeResult => ({
  ok: false,
  outcome: null,
  url: null,
  error,
  isSample: false,
});

const readAnswerMarks = async () => {
  const marks = (await getFirestore().doc('pipeline/answered').get()).get('marks') as unknown;
  return isObject(marks) ? marks : {};
};

// Read from the inbox's stored list, the one the dashboard shows and numbers its answer marks by; null while the inbox hasn't read the newest status.
const readOpenQuestion = async (prNumber: number, statusAt: number | null) => {
  const prs = (await getFirestore().doc('pipeline/inbox').get()).get('prs') as unknown;
  const pr = (Array.isArray(prs) ? prs : []).filter(isObject).find((candidate) => candidate.number === prNumber);
  const status = isObject(pr?.status) ? pr.status : null;
  const storedAt = Number(status?.updatedAt) || 0;
  if (status === null || (statusAt !== null && storedAt < statusAt)) return null;
  const marks = await readAnswerMarks();
  return (Array.isArray(status.ownerItems) ? status.ownerItems : [])
    .filter(isObject)
    .some(
      (item, index) =>
        item.isTask !== true &&
        typeof item.settled !== 'string' &&
        Number(marks[`${prNumber}:${index}`] ?? 0) < storedAt,
    );
};

// The emulator's dashboard shows made-up pull requests, so it checks the seeded inbox and posts nothing.
const rehearseMerge = async (prNumber: number): Promise<MergeResult> => {
  const inbox = await getFirestore().doc('pipeline/inbox').get();
  const prs = inbox.get('prs') as unknown;
  const pr = (Array.isArray(prs) ? prs : []).filter(isObject).find((candidate) => candidate.number === prNumber);
  if (!pr) return refused("That pull request doesn't exist.");
  const status = isObject(pr.status) ? pr.status : null;
  const refusal = getMergeRefusal({
    isOpen: true,
    labels: Array.isArray(pr.labels) ? pr.labels.map(String) : [],
    ci: String(pr.ci),
    isMergeable: true,
    state: typeof status?.state === 'string' ? status.state : null,
    mustDo: status === null ? 'no status' : Array.isArray(status.mustDo) ? status.mustDo.map(String) : null,
    isStatusForHead: true,
    isBehind: false,
    hasOpenQuestion: await readOpenQuestion(prNumber, null),
  });
  if (refusal !== null) return refused(refusal);
  const sessionUrl =
    typeof status?.sessionUrl === 'string'
      ? status.sessionUrl
      : typeof pr.bodySessionUrl === 'string'
        ? pr.bodySessionUrl
        : null;
  const outcome: MergeOutcome = (await isDrivenBySession(sessionUrl)) ? 'asked' : 'merged';
  return { ok: true, outcome, url: null, error: null, isSample: true };
};

const readLock = async (token: string) => {
  const ref = await githubFetch(token, `/git/ref/${LOCK_REF}`);
  if (ref.status === 404) return { sha: null, holder: null, isOwn: false };
  if (!ref.ok) throw ref;
  const object = (await readJson(ref))?.object;
  const sha = isObject(object) ? String(object.sha) : '';
  const commit = await githubFetch(token, `/git/commits/${sha}`);
  if (!commit.ok) throw commit;
  const message = String((await readJson(commit))?.message ?? '');
  const holder = /^merge-lock: free\b/.test(message)
    ? null
    : (message.match(/^pr: #(\d+)/m)?.[1] ?? 'unknown');
  return { sha, holder, isOwn: message.includes(`\nholder: ${DASHBOARD_HOLDER}\n`) };
};

// Never forced: a branch someone moved since it was read refuses (422), so two takes can't both win.
const writeLock = async (token: string, parent: string | null, message: string) => {
  const commit = await githubFetch(token, '/git/commits', {
    method: 'POST',
    body: JSON.stringify({ message, tree: EMPTY_TREE, parents: parent === null ? [] : [parent] }),
  });
  if (!commit.ok) throw commit;
  const sha = String((await readJson(commit))?.sha);
  const moved =
    parent === null
      ? await githubFetch(token, '/git/refs', {
          method: 'POST',
          body: JSON.stringify({ ref: `refs/${LOCK_REF}`, sha }),
        })
      : await githubFetch(token, `/git/refs/${LOCK_REF}`, {
          method: 'PATCH',
          body: JSON.stringify({ sha, force: false }),
        });
  if (moved.status === 422) return null;
  if (!moved.ok) throw moved;
  return sha;
};

const toLockMessage = (prNumber: number) =>
  `merge-lock: held\n\npr: #${prNumber}\nholder: ${DASHBOARD_HOLDER}\ntaken: ${new Date().toISOString()}\n`;

// A release that lost a race is fine when someone else already freed or retook the lock.
const releaseLock = async (token: string, held: string, prNumber: number) => {
  try {
    if ((await writeLock(token, held, `merge-lock: free\n\nafter: #${prNumber}\n`)) !== null) return true;
    const lock = await readLock(token);
    return lock.holder !== String(prNumber);
  } catch (error) {
    logger.error('mergePipelinePr: lock not released', error instanceof Response ? error.status : getErrorName(error));
    return false;
  }
};

// A queued run waits behind the running one, and a newer queued run cancels it, so a merge waits for both to clear.
const ACTIONS_REFUSED = `The token can't see whether a deploy is running. Give it Actions: Read-only on ${TOKEN_PAGE} (edit the Pipeline answers token; no new token needed), then try again.`;

const isDeploying = async (token: string) => {
  const responses = await Promise.all(
    ['queued', 'in_progress'].map((state) =>
      githubFetch(token, `/actions/workflows/${DEPLOY_WORKFLOW}/runs?status=${state}&per_page=1`),
    ),
  );
  const failed = responses.find((response) => !response.ok);
  if (failed && (failed.status === 401 || failed.status === 403) && !isBusy(failed)) {
    throw new ActionsRefused();
  }
  if (failed) throw failed;
  const bodies = await Promise.all(responses.map(readJson));
  return bodies.some((body) => Number(body?.total_count) > 0);
};

const DEPLOYING = 'A deploy is running. Try again once it finishes.';

const takeLock = async (token: string, prNumber: number) => {
  if (await isDeploying(token)) return { held: null, error: DEPLOYING };
  const lock = await readLock(token);
  // Only a lock an earlier dashboard click left behind is reused; a session's lock for the same PR is the session's.
  if (lock.holder === String(prNumber) && lock.isOwn && lock.sha !== null) {
    return { held: lock.sha, error: null };
  }
  if (lock.holder !== null) {
    return {
      held: null,
      error:
        lock.holder === 'unknown'
          ? 'Another merge is going through. Try again once its deploy finishes.'
          : `#${lock.holder} is merging. Try again once its deploy finishes.`,
    };
  }
  const held = await writeLock(token, lock.sha, toLockMessage(prNumber));
  if (held === null) {
    return { held: null, error: 'Another merge started just now. Try again once its deploy finishes.' };
  }
  // A merge that landed just before the take can take a moment to show its deploy, so look once more while holding.
  // A failed look counts as a deploy, so the lock is never kept on an answer it couldn't read.
  if (!(await isDeploying(token).catch(() => true))) return { held, error: null };
  const isFreed = await releaseLock(token, held, prNumber);
  return {
    held: null,
    error: isFreed
      ? DEPLOYING
      : `${DEPLOYING} The merge lock is still held: run npm run merge:lock -- release ${prNumber} so sessions can merge.`,
  };
};

const markReady = async (token: string, nodeId: string) => {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query:
        'mutation($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { pullRequest { isDraft } } }',
      variables: { id: nodeId },
    }),
    signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
  });
  if (!response.ok) throw response;
  const errors = (await readJson(response))?.errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const [first] = errors.filter(isObject);
  logger.warn('mergePipelinePr: mark ready refused', first?.type, first?.message);
  if (first?.type === 'RATE_LIMITED') return BUSY;
  if (first?.type === 'FORBIDDEN') {
    readSecret.forget('PIPELINE_GITHUB_TOKEN');
    return `The token can't mark pull requests ready. Give it Pull requests: Read and write on ${TOKEN_PAGE} (edit the Pipeline answers token; no new token needed), then try again.`;
  }
  return "Couldn't mark it ready for review.";
};

// A reload or a second tab asks once: an ask newer than the status is still waiting on the session.
const askSession = async (token: string, prNumber: number, since: number, commentCount: number): Promise<MergeResult> => {
  const recent = await readRecentComments(token, prNumber, commentCount);
  const earlier = (recent ?? []).find(
    (comment) =>
      typeof comment.body === 'string' &&
      comment.body.trim() === MERGE_COMMENT &&
      Date.parse(String(comment.created_at)) >= since,
  );
  if (earlier) {
    return { ok: true, outcome: 'asked', url: typeof earlier.html_url === 'string' ? earlier.html_url : null, error: null, isSample: false };
  }
  const comment = await githubFetch(token, `/issues/${prNumber}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body: MERGE_COMMENT }),
  });
  if (!comment.ok) throw comment;
  const posted = await readJson(comment);
  return {
    ok: true,
    outcome: 'asked',
    url: typeof posted?.html_url === 'string' ? posted.html_url : null,
    error: null,
    isSample: false,
  };
};

const squash = async (token: string, pr: Json, prNumber: number, sha: string): Promise<MergeResult> => {
  if (pr.draft === true) {
    const notReady = await markReady(token, String(pr.node_id)).catch(
      async (error: unknown) => (await toRefused(error, "Couldn't mark it ready for review.")).error,
    );
    if (notReady !== null) return refused(notReady);
  }
  const merge = await githubFetch(token, `/pulls/${prNumber}/merge`, {
    method: 'PUT',
    body: JSON.stringify({
      sha,
      merge_method: 'squash',
      commit_title: `${String(pr.title)} (#${prNumber})`,
    }),
  });
  if (merge.status === 409) return refused('Someone pushed to it just now. Check it again before merging.');
  if (merge.status === 405 || merge.status === 422) {
    const body = await readJson(merge);
    logger.warn('mergePipelinePr: GitHub would not merge', merge.status, body?.message);
    return refused("GitHub won't merge it yet: a required check or review may still be missing.");
  }
  if (!merge.ok) throw merge;
  return {
    ok: true,
    outcome: 'merged',
    url: typeof pr.html_url === 'string' ? pr.html_url : null,
    error: null,
    isSample: false,
  };
};

const toRefused = async (error: unknown, fallback: string) => {
  if (!(error instanceof Response)) {
    logger.warn('mergePipelinePr: request failed', getErrorName(error));
    return refused(fallback);
  }
  logger.warn('mergePipelinePr: GitHub refused', error.status);
  if (isBusy(error)) return refused(BUSY);
  if (error.status === 401 || error.status === 403) {
    return refused(await forgetAndRefuse(error, 'merge pull requests'));
  }
  return refused(fallback === "Couldn't reach GitHub." ? "Couldn't merge it." : fallback);
};

const isBehindBase = async (token: string, pr: Json, sha: string) => {
  const base = isObject(pr.base) ? String(pr.base.ref) : DEFAULT_BRANCH;
  const response = await githubFetch(token, `/compare/${encodeURIComponent(base)}...${sha}`);
  if (!response.ok) throw response;
  return Number((await readJson(response))?.behind_by) > 0;
};

const readGates = async (token: string, prNumber: number) => {
  try {
    const pull = await githubFetch(token, `/pulls/${prNumber}`);
    if (pull.status === 404) return refused("That pull request doesn't exist.");
    if (!pull.ok) throw pull;
    const pr = await readJson(pull);
    if (pr === null) return refused("Couldn't read that pull request.");
    const sha = String(isObject(pr.head) ? pr.head.sha : '');
    const runs = await githubFetch(token, `/commits/${sha}/check-runs?per_page=100`);
    if (!runs.ok) throw runs;
    const runsBody = await readJson(runs);
    const runList = (Array.isArray(runsBody?.check_runs) ? runsBody.check_runs : []).filter(isObject);
    if (Number(runsBody?.total_count) > runList.length) {
      return refused('It has more checks than the dashboard reads. Merge it on GitHub.');
    }
    const status = await findStatusComment(token, prNumber);
    const statusBody = typeof status?.body === 'string' ? status.body : null;
    const refusal = getMergeRefusal({
      isOpen: pr.state === 'open',
      labels: (Array.isArray(pr.labels) ? pr.labels : []).filter(isObject).map((label) => String(label.name)),
      ci: summarizeRuns(runList),
      isMergeable: typeof pr.mergeable === 'boolean' ? pr.mergeable : null,
      state: statusBody === null ? null : readState(statusBody),
      mustDo: statusBody === null ? 'no status' : readMustDo(statusBody),
      isStatusForHead: statusBody !== null && isHeadingFor(statusBody, sha),
      isBehind: await isBehindBase(token, pr, sha),
      hasOpenQuestion:
        statusBody === null ? false : await readOpenQuestion(prNumber, Date.parse(String(status?.updated_at)) || 0),
    });
    if (refusal !== null) return refused(refusal);
    const sessionUrl =
      statusBody?.match(SESSION_MARKER)?.[1] ??
      (typeof pr.body === 'string' ? pr.body.match(SESSION_LINK)?.at(-1) : null) ??
      null;
    return { pr, sha, sessionUrl, statusAt: Date.parse(String(status?.updated_at)) || 0 };
  } catch (error) {
    return toRefused(error, "Couldn't reach GitHub.");
  }
};

const mergeOnGithub = async (token: string, prNumber: number): Promise<MergeResult> => {
  const checked = await readGates(token, prNumber);
  if ('ok' in checked) return checked;
  const { pr, sha, sessionUrl, statusAt } = checked;

  if (await isDrivenBySession(sessionUrl)) {
    try {
      return await askSession(token, prNumber, statusAt, typeof pr.comments === 'number' ? pr.comments : 0);
    } catch (error) {
      return toRefused(error, "Couldn't post the comment.");
    }
  }

  // Taking the lock is the first write, so a token without Contents write is refused before a draft is touched.
  const isIntoMain = isObject(pr.base) && pr.base.ref === DEFAULT_BRANCH;
  const lock = isIntoMain
    ? await takeLock(token, prNumber).catch(async (error: unknown) => ({
        held: null,
        error:
          error instanceof ActionsRefused
            ? ACTIONS_REFUSED
            : (await toRefused(error, "Couldn't take the merge lock.")).error,
      }))
    : { held: null, error: null };
  if (lock.error !== null) return refused(lock.error);
  const result = await squash(token, pr, prNumber, sha).catch((error: unknown) => toRefused(error, MAYBE_MERGED));
  // The next taker waits for this merge's deploy, so the lock only has to cover the merge itself.
  if (lock.held === null || (await releaseLock(token, lock.held, prNumber))) return result;
  return {
    ...result,
    error: `${result.error ?? 'Merged'}, but the merge lock is still held. Run npm run merge:lock -- release ${prNumber} so sessions can merge.`,
  };
};

/** Merges a pull request from the dashboard: asks its session to when one drives it, otherwise merges it on GitHub, after checking every gate again. */
export const mergePipelinePr = onCall(
  { ...CALLABLE_OPTIONS, timeoutSeconds: 120 },
  async (request) => {
    assertAdmin(request.auth);
    const prNumber = readMergeRequest(request.data);
    if (isRunningInEmulator()) return rehearseMerge(prNumber);
    const token = await readSecret('PIPELINE_GITHUB_TOKEN', AbortSignal.timeout(10_000));
    if (token === null) {
      throw new HttpsError('failed-precondition', "Merging from the dashboard isn't set up yet.");
    }
    return mergeOnGithub(token, prNumber);
  },
);
