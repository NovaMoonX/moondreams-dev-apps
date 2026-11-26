import Anthropic from '@anthropic-ai/sdk';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';

import {
  recordAssistantTurn,
  reserveAssistantTurn,
} from '../../../assistant/assistantUsage.js';
import {
  createTurnTally,
  escapePromptText,
  getTurnCost,
  getTurnErrorCode,
  streamTurn,
  type TurnEvent,
  type TurnLine,
} from '../../../assistant/streamTurn.js';
import { verifyCaller } from '../../../assistant/verifyCaller.js';
import { isForcedFixture, isRunningInEmulator } from '../../../emulator.js';
import { isGateOpenForToken } from '../../../gates/assertGateOpen.js';
import { isServedOrigin, SERVED_ORIGINS } from '../../../servedOrigins.js';
import {
  buildPepperTurn,
  PEPPER_LIMITS,
  PEPPER_SYSTEM,
  PEPPER_TOOLS,
} from './pepperPrompt.js';

if (getApps().length === 0) {
  initializeApp();
}

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const APP_ID = 'pinch';
const MAX_STANDING_CHARS = 40_000;
const MAX_SCREEN_CHARS = 8_000;
const MAX_HEARD_CHARS = 1_000;
const MAX_ALTERNATIVES = 4;
// A user line is a whole earlier turn as this server built it (screen, heard and guesses, escaped, in their tags), so its cap is that turn's largest size; escaping can grow text fourfold.
const MAX_USER_LINE_CHARS =
  4 * (MAX_SCREEN_CHARS + (MAX_ALTERNATIVES + 1) * MAX_HEARD_CHARS) + 500;
const MAX_ASSISTANT_LINE_CHARS = 4_000;
const MAX_HISTORY = 40;
// The history is sent again each turn, so its total is capped too; the device drops its oldest exchanges to fit.
const MAX_HISTORY_CHARS = 160_000;
const FIXTURE_REPLY =
  "This is Pepper running locally without a Claude key, so here's a stand-in answer. Add the key with npm run ai:anthropic-secret to hear the real one.";

const readKey = () => {
  if (isForcedFixture('anthropic')) return '';
  try {
    return ANTHROPIC_API_KEY.value();
  } catch {
    return '';
  }
};

const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max;

/** The body a turn sends, or null when it is refused; the device builds the recipe and screen text from what it shows and keeps the last 20 exchanges, fewer when their text passes the total cap. */
export function readPepperBody(body: unknown) {
  const { standing, screen, heard, alternatives, history } = (body ??
    {}) as Record<string, unknown>;
  if (!isText(standing, MAX_STANDING_CHARS) || standing.trim() === '') {
    return null;
  }
  if (!isText(screen, MAX_SCREEN_CHARS)) return null;
  if (!isText(heard, MAX_HEARD_CHARS) || heard.trim() === '') return null;
  const lines = Array.isArray(history) ? history : [];
  const isHistoryOk =
    lines.length <= MAX_HISTORY &&
    lines.every(
      (line: { role?: unknown; text?: unknown }, index) =>
        line?.role === (index % 2 === 0 ? 'user' : 'assistant') &&
        isText(
          line.text,
          index % 2 === 0 ? MAX_USER_LINE_CHARS : MAX_ASSISTANT_LINE_CHARS,
        ) &&
        line.text.trim() !== '',
    ) &&
    lines.length % 2 === 0 &&
    lines.reduce(
      (total: number, line: { text: string }) => total + line.text.length,
      0,
    ) <= MAX_HISTORY_CHARS;
  if (!isHistoryOk) return null;
  return {
    standing: `<recipe>\n${escapePromptText(standing)}\n</recipe>`,
    turn: buildPepperTurn(
      screen,
      heard.trim(),
      (Array.isArray(alternatives) ? alternatives : [])
        .filter((entry): entry is string => isText(entry, MAX_HEARD_CHARS))
        .filter((entry) => entry.trim() !== '' && entry !== heard)
        .slice(0, MAX_ALTERNATIVES),
    ),
    history: lines as TurnLine[],
  };
}

/** One spoken turn with Pepper, streamed back as server-sent events as Claude writes it. */
export const pepperTurn = onRequest(
  {
    region: 'us-central1',
    maxInstances: 10,
    timeoutSeconds: 60,
    secrets: [ANTHROPIC_API_KEY],
    cors: SERVED_ORIGINS,
  },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method' });
      return;
    }
    if (!isServedOrigin(req.headers.origin, SERVED_ORIGINS)) {
      res.status(403).json({ error: 'origin' });
      return;
    }
    const caller = await verifyCaller(req);
    if ('error' in caller) {
      res.status(401).json({ error: caller.error });
      return;
    }
    const { uid } = caller;
    const isOpen = await isGateOpenForToken(
      caller.token,
      APP_ID,
      'pepper',
      'testing',
    ).catch(() => false);
    if (!isOpen) {
      res.status(403).json({ error: 'gate' });
      return;
    }
    // A warm-up starts the instance as cooking opens, so the first question meets a ready server.
    if ((req.body as { warm?: unknown } | undefined)?.warm === true) {
      res.status(204).end();
      return;
    }
    const body = readPepperBody(req.body);
    if (body === null) {
      res.status(400).json({ error: 'body' });
      return;
    }
    const apiKey = readKey();
    if (apiKey === '' && !isRunningInEmulator()) {
      logger.error('pepper.keyMissing', { event: 'pepper.keyMissing' });
      res.status(503).json({ error: 'unavailable' });
      return;
    }

    const firestore = getFirestore();
    const now = Date.now();
    const reserved = await reserveAssistantTurn(firestore, {
      appId: APP_ID,
      uid,
      now,
      limits: PEPPER_LIMITS,
    }).catch((error: unknown) => {
      logger.error('pepper.reserveFailed', {
        event: 'pepper.reserveFailed',
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    });
    if (reserved === null) {
      res.status(503).json({ error: 'unavailable' });
      return;
    }
    if (reserved.held !== null) {
      res.status(429).json({ error: 'held', reason: reserved.held });
      return;
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const emit = (event: TurnEvent) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const aborter = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) aborter.abort();
    });
    const tally = createTurnTally();
    try {
      if (apiKey === '') {
        emit({ type: 'text', text: FIXTURE_REPLY });
        emit({
          type: 'done',
          user: body.turn,
          assistant: FIXTURE_REPLY,
          endedBy: 'answered',
          searches: 0,
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          ms: 0,
          model: null,
          isStandIn: true,
        });
        return;
      }
      const done = await streamTurn({
        client: new Anthropic({ apiKey, maxRetries: 1 }),
        role: 'converse',
        system: PEPPER_SYSTEM,
        tools: PEPPER_TOOLS,
        standing: body.standing,
        history: body.history,
        turn: body.turn,
        maxSearches: reserved.searchesReserved,
        tally,
        emit,
        signal: aborter.signal,
      });
      logger.info('pepper.turn', {
        event: 'pepper.turn',
        endedBy: done.endedBy,
        ms: done.ms,
        model: done.model,
        searches: done.searches,
        ...done.usage,
      });
    } catch (error) {
      const code = getTurnErrorCode(error);
      if (code !== 'aborted') {
        logger.error('pepper.turnFailed', { event: 'pepper.turnFailed', code });
      }
      emit({ type: 'error', code });
    } finally {
      // Settled before the response ends, since an instance may lose its CPU once it has answered; the device already has its last event.
      await recordAssistantTurn(firestore, {
        appId: APP_ID,
        uid,
        now,
        searchesReserved: reserved.searchesReserved,
        searches: tally.searches,
        hundredthsOfCent:
          tally.rounds === 0
            ? 0
            : getTurnCost('converse', tally.usage, tally.searches),
      }).catch((error: unknown) =>
        logger.error('pepper.recordFailed', {
          event: 'pepper.recordFailed',
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      if (!res.writableEnded) res.end();
    }
  },
);
