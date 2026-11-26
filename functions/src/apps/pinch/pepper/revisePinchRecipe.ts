import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { createAnthropicSearchProvider } from '../../../ai/providers/anthropic.js';
import { getUsageCost } from '../../../ai/models.js';
import {
  recordAssistantTurn,
  reserveAssistantTurn,
} from '../../../assistant/assistantUsage.js';
import { SEARCH_COST_HUNDREDTHS } from '../../../assistant/streamTurn.js';
import { isForcedFixture, isRunningInEmulator } from '../../../emulator.js';
import { assertGateOpen } from '../../../gates/assertGateOpen.js';
import { SERVED_ORIGINS } from '../../../servedOrigins.js';
import {
  MAX_PEPPER_ASK_LENGTH,
  MAX_PEPPER_ROUNDS,
} from '../share/pinchConstants.js';
import { cleanLinks } from '../share/recipeLinks.js';
import { PEPPER_LIMITS } from './pepperPrompt.js';
import { REVISE_PROMPT, REVISE_TOOL } from './reviseRecipePrompt.js';

if (getApps().length === 0) {
  initializeApp();
}

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const APP_ID = 'pinch';
const MAX_RECIPE_CHARS = 60_000;
const MAX_ANSWER_CHARS = 120_000;
const MAX_SEARCHES = 2;
const MAX_MILLIS = 25_000;
const MAX_SOURCES = 5;
const FIXTURE_REPLY =
  'This is Pepper running locally without a Claude key, so nothing was changed. Run npm run local:app -- pinch and choose the real Claude to try a real change.';

export interface RevisePinchRecipeResult {
  revision: Record<string, unknown>;
  sources: { title: string; url: string }[];
}

const readKey = () => {
  if (isForcedFixture('anthropic')) return '';
  try {
    return ANTHROPIC_API_KEY.value();
  } catch {
    return '';
  }
};

const URL_IN_TEXT = /https?:\/\/[^\s<>"')\]]+/gi;

/** An address as compared: trimmed, host in lower case, no hash and no trailing slash; null when it is not a web address. */
export const normalizeAddress = (text: string) => {
  try {
    const url = new URL(text.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    return url.href.replace(/\/$/, '');
  } catch {
    return null;
  }
};

/** Every address the model may hand back: the recipe's own, the pages its search found and any the person wrote. */
export const readAllowedAddresses = (
  recipeLinks: unknown,
  foundUrls: string[],
  typedTexts: string[],
) =>
  new Set(
    [
      ...(Array.isArray(recipeLinks) ? recipeLinks : []).map(
        (entry) => (entry as { url?: unknown } | null)?.url,
      ),
      ...foundUrls,
      ...typedTexts.flatMap((text) =>
        (text.match(URL_IN_TEXT) ?? []).map((link) =>
          link.replace(/[.,;:!?]+$/, ''),
        ),
      ),
    ].flatMap((value) => {
      const address =
        typeof value === 'string' ? normalizeAddress(value) : null;
      return address === null ? [] : [address];
    }),
  );

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The request's recipe, ask and earlier asks, or null when the shape or size is refused. */
export function readReviseBody(data: unknown) {
  const { recipe, ask, earlierAsks } = (data ?? {}) as Record<string, unknown>;
  if (
    !isObject(recipe) ||
    !Array.isArray(recipe.ingredients) ||
    !Array.isArray(recipe.steps) ||
    !Array.isArray(recipe.links)
  ) {
    return null;
  }
  const recipeText = JSON.stringify(recipe);
  if (recipeText.length > MAX_RECIPE_CHARS) return null;
  if (
    typeof ask !== 'string' ||
    ask.trim() === '' ||
    ask.length > MAX_PEPPER_ASK_LENGTH
  ) {
    return null;
  }
  const earlier = Array.isArray(earlierAsks) ? earlierAsks : [];
  if (
    earlier.length > MAX_PEPPER_ROUNDS ||
    !earlier.every(
      (entry) =>
        typeof entry === 'string' && entry.length <= MAX_PEPPER_ASK_LENGTH,
    )
  ) {
    return null;
  }
  return { recipe, recipeText, ask, earlier: earlier as string[] };
}

const toMessage = ({
  recipeText,
  ask,
  earlier,
}: NonNullable<ReturnType<typeof readReviseBody>>) =>
  `--- BEGIN RECIPE (JSON) ---\n${recipeText}\n--- END RECIPE ---\n\n${
    earlier.length > 0
      ? `Earlier asks, already applied:\n${earlier.map((entry) => `- ${entry}`).join('\n')}\n\n`
      : ''
  }--- BEGIN ASK ---\n${ask}\n--- END ASK ---`;

/** The model's answer with its links cleaned and capped and any address not in `allowed` dropped; null when it is not a revision. */
export function cleanRevision(answer: unknown, allowed: ReadonlySet<string>) {
  if (!isObject(answer) || JSON.stringify(answer).length > MAX_ANSWER_CHARS) {
    return null;
  }
  if (
    typeof answer.reply !== 'string' ||
    answer.reply.trim() === '' ||
    typeof answer.isChanged !== 'boolean' ||
    !Array.isArray(answer.links)
  ) {
    return null;
  }
  return {
    ...answer,
    links: cleanLinks(answer.links)
      .filter(({ url }) => {
        const address = normalizeAddress(url);
        return address !== null && allowed.has(address);
      })
      .map(({ kind, label, url }) => ({ kind, label, url })),
  };
}

/** One change to a recipe the person asked Pepper for, made by Claude with a capped web search for a link; nothing is saved, the form shows the result. */
export const revisePinchRecipe = onCall(
  {
    region: 'us-central1',
    maxInstances: 10,
    enforceAppCheck: true,
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: 60,
    cors: SERVED_ORIGINS,
  },
  async (request): Promise<RevisePinchRecipeResult> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
    await assertGateOpen(
      request,
      APP_ID,
      'pepper-edits',
      'off',
      'Changing a recipe with Pepper is not turned on for you.',
    );
    const body = readReviseBody(request.data);
    if (body === null) {
      throw new HttpsError('invalid-argument', 'That request is too large.');
    }
    const apiKey = readKey();
    if (apiKey === '') {
      if (!isRunningInEmulator()) {
        logger.error('pepper.revise.keyMissing');
        throw new HttpsError('unavailable', 'Try again later.');
      }
      return {
        revision: {
          reply: FIXTURE_REPLY,
          isChanged: false,
          links: body.recipe.links,
        },
        sources: [],
      };
    }

    const firestore = getFirestore();
    const now = Date.now();
    const reserved = await reserveAssistantTurn(firestore, {
      appId: APP_ID,
      uid,
      now,
      limits: { ...PEPPER_LIMITS, searchesPerTurn: MAX_SEARCHES },
    }).catch((error: unknown) => {
      logger.error('pepper.revise.reserveFailed', {
        message: error instanceof Error ? error.message : String(error),
      });
      throw new HttpsError('unavailable', 'Try again later.');
    });
    if (reserved.held !== null) {
      throw new HttpsError('resource-exhausted', 'Try again later.');
    }

    const state = { searches: 0, hundredthsOfCent: 0 };
    try {
      const result = await createAnthropicSearchProvider(apiKey).runWebSearch({
        role: 'revise',
        system: REVISE_PROMPT,
        message: toMessage(body),
        maxSearches: reserved.searchesReserved,
        maxMillis: MAX_MILLIS,
        terminalTool: REVISE_TOOL,
      });
      state.searches = result.searches;
      state.hundredthsOfCent =
        getUsageCost('revise', result.usage) +
        result.searches * SEARCH_COST_HUNDREDTHS;
      const revision =
        result.endedBy === 'terminal'
          ? cleanRevision(
              result.terminalInput,
              readAllowedAddresses(body.recipe.links, result.foundUrls, [
                body.ask,
                ...body.earlier,
              ]),
            )
          : null;
      logger.info('pepper.revise', {
        endedBy: result.endedBy,
        errorCode: result.errorCode,
        searches: result.searches,
        ...result.usage,
      });
      if (revision === null) {
        throw new HttpsError(
          'unavailable',
          'Pepper could not make that change.',
        );
      }
      return {
        revision,
        sources: result.sources.slice(0, MAX_SOURCES),
      };
    } finally {
      await recordAssistantTurn(firestore, {
        appId: APP_ID,
        uid,
        now,
        searchesReserved: reserved.searchesReserved,
        searches: state.searches,
        hundredthsOfCent: state.hundredthsOfCent,
      }).catch((error: unknown) =>
        logger.error('pepper.revise.recordFailed', {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  },
);
