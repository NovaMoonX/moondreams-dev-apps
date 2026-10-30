import { getApps, initializeApp } from 'firebase-admin/app';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

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
const MAX_ITEMS = 20;
const MAX_QUESTION = 500;
const MAX_CHOICE = 300;
const MAX_NOTE = 2000;

interface AnswerItem {
  question: string;
  choice: string | null;
  note: string | null;
}

interface PrAnswers {
  prNumber: number;
  items: AnswerItem[];
}

interface PrResult {
  prNumber: number;
  ok: boolean;
  url: string | null;
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

const readItem = (raw: unknown): AnswerItem => {
  if (!isObject(raw)) throw invalid('Bad answer.');
  const question = readText(raw.question, MAX_QUESTION);
  const choice = readText(raw.choice, MAX_CHOICE);
  const note = readText(raw.note, MAX_NOTE);
  if (question === null) throw invalid('Each answer needs its question.');
  if (choice === null && note === null) {
    throw invalid('Each answer needs a choice or a note.');
  }
  return { question, choice, note };
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
      throw invalid('Send between 1 and 20 answers per pull request.');
    }
    return { prNumber, items: items.map(readItem) };
  });
};

// A zero-width joiner after "@" keeps a stray name from pinging anyone.
const defang = (value: string) => value.replace(/@/g, '@‍');

const toCommentBody = (items: AnswerItem[]) => {
  const lines = items.flatMap(({ question, choice, note }) => {
    const first =
      choice !== null
        ? `- **${defang(question)}** ${defang(choice)}`
        : `- **${defang(question)}**${note !== null ? ' Note: ' + defang(note).replace(/\n/g, '\n  ') : ''}`;
    const second =
      choice !== null && note !== null
        ? [`  Note: ${defang(note).replace(/\n/g, '\n  ')}`]
        : [];
    return [first, ...second];
  });
  return [
    '<!-- pipeline-answer -->',
    '**Answers from the admin dashboard**',
    '',
    ...lines,
  ].join('\n');
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

const postAnswers = async (
  token: string,
  { prNumber, items }: PrAnswers,
): Promise<PrResult> => {
  const fail = (error: string): PrResult => ({
    prNumber,
    ok: false,
    url: null,
    error,
  });
  try {
    const pull = await githubFetch(token, `/pulls/${prNumber}`);
    if (pull.status === 404) return fail("That pull request doesn't exist.");
    if (!pull.ok) {
      logger.warn('answerPipelineQuestions: read failed', pull.status);
      return fail(
        pull.status === 401 || pull.status === 403
          ? "GitHub didn't accept the token."
          : "Couldn't reach that pull request.",
      );
    }
    const state = ((await pull.json()) as { state?: unknown }).state;
    if (state !== 'open') return fail('That pull request is already closed.');

    const comment = await githubFetch(token, `/issues/${prNumber}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: toCommentBody(items) }),
    });
    if (!comment.ok) {
      logger.warn('answerPipelineQuestions: post failed', comment.status);
      return fail(
        comment.status === 401 || comment.status === 403
          ? "The token can't comment on pull requests."
          : "Couldn't post the comment.",
      );
    }
    const url = ((await comment.json()) as { html_url?: unknown }).html_url;
    return {
      prNumber,
      ok: true,
      url: typeof url === 'string' ? url : null,
      error: null,
    };
  } catch {
    logger.warn('answerPipelineQuestions: request failed');
    return fail("Couldn't reach GitHub.");
  }
};

export const answerPipelineQuestions = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    timeoutSeconds: 120,
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request) => {
    const email = request.auth?.token.email?.trim().toLowerCase() ?? null;
    const isEmulator =
      process.env.FUNCTIONS_EMULATOR === 'true' && !process.env.K_SERVICE;
    const isAdminEmail =
      email === ADMIN_EMAIL && request.auth?.token.email_verified === true;
    const isEmulatorDev = isEmulator && request.auth?.token.dev === true;
    if (
      !request.auth ||
      (!isAdminEmail && !isEmulatorDev && request.auth.token.admin !== true)
    ) {
      throw new HttpsError(
        'permission-denied',
        'Only the admin can answer from the dashboard.',
      );
    }

    const answers = readAnswers(request.data);
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

    const results = await answers.reduce<Promise<PrResult[]>>(
      async (done, answer) => [
        ...(await done),
        await postAnswers(token, answer),
      ],
      Promise.resolve([]),
    );
    return { results };
  },
);
