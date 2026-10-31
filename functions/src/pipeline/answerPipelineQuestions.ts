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
  const text = readText(data.text, MAX_QUESTION);
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
    const at = await recordSettled({ prNumber, sessionId, text }, outcome);
    return { ok: true, error: null, at };
  },
);
