import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { randomBytes } from 'node:crypto';

import { createOptionalSecretReader } from '../imageSearch/optionalSecret.js';
import {
  EMAIL_DOMAIN,
  eventIdFor,
  hourKey,
  htmlToText,
  isSecretValid,
  readAddressToken,
  takeRateSlot,
} from './emailUtils.js';
import {
  isForwardingConfirmation,
  readConfirmation,
} from './forwardingConfirmation.js';

/** The one secret every app's address shares, set as a Functions secret and on the email worker. */
export const EMAIL_WEBHOOK_SECRET_NAME = 'EMAIL_WEBHOOK_SECRET';
const SECRET_HEADER = 'x-app-email-secret';
const MAX_BODY_BYTES = 500 * 1024;
const DAY_MS = 86_400_000;

export interface EmailMail {
  to: string;
  from: string;
  subject: string;
  text: string;
  receivedAt: number;
  isDkimPassed: boolean;
}

export interface EmailHandlerInput {
  firestore: Firestore;
  uid: string;
  mail: EmailMail;
  /** The id of the event document this email is recorded under. */
  eventId: string;
  now: number;
}

interface EmailIngestConfig {
  /** Names the app in logs; never in a response. */
  app: string;
  /** The address's local part before the token, e.g. `name` in `name+<token>@…`. */
  prefix: string;
  secretName: string;
  tokenPath: (token: string) => string;
  isOpenFor: (uid: string) => Promise<boolean>;
  eventPath: (uid: string, eventId: string) => string;
  ratePath: (uid: string, hour: string) => string;
  intakePath: (uid: string) => string;
  maxPerHour: number;
  /** Does every write for one email (the event record included, created so a redelivery fails) and says what became of it. */
  handle: (input: EmailHandlerInput) => Promise<{ outcome: string }>;
  /** Records a forwarding confirmation (the intake document already holds its link); without it nothing but the intake changes. */
  /** The intake fields that hold a confirmation's link and code, when they are kept some other way than plain; the default is `confirmUrl` and `confirmCode`. */
  confirmationFields?: (
    input: EmailHandlerInput,
    confirmation: { confirmUrl: string | null; confirmCode: string | null },
  ) => Promise<Record<string, unknown>>;
  onConfirmation?: (input: EmailHandlerInput) => Promise<{ outcome: string }>;
}

const readSecret = createOptionalSecretReader({ fetch: globalThis.fetch });

const asString = (value: unknown, max: number) =>
  typeof value === 'string' ? value.slice(0, max) : '';

/**
 * The request handler for the email worker's hand-over of one email. Every answer is a bare status or `{ outcome }`; nothing from the email is echoed.
 * The shared secret is optional at deploy time and the endpoint answers 503 until it is set.
 */
export function createEmailIngest(config: EmailIngestConfig) {
  const log = (name: string, fields: Record<string, unknown> = {}) =>
    logger.info(`email.${name}`, { app: config.app, ...fields });

  return async (request: Request, response: Response) => {
    if (request.method !== 'POST') {
      response.status(405).send('Method not allowed');
      return;
    }
    const expected = await readSecret(
      config.secretName,
      AbortSignal.timeout(4_000),
    );
    if (expected === null) {
      response.status(503).send('Not available');
      return;
    }
    if (!isSecretValid(request.header(SECRET_HEADER), expected)) {
      logger.warn('email.unauthorized', { app: config.app });
      response.status(401).send('Unauthorized');
      return;
    }
    if ((request.rawBody?.length ?? 0) > MAX_BODY_BYTES) {
      response.status(413).send('Too large');
      return;
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const token = readAddressToken(
      asString(body.to, 320),
      config.prefix,
      EMAIL_DOMAIN,
    );
    if (token === null) {
      response.status(404).send('No such address');
      return;
    }
    const [spf, dkim] = [body.spf, body.dkim].map((value) =>
      asString(value, 20).toLowerCase(),
    );
    if (dkim === 'fail') {
      logger.warn('email.authFailed', { app: config.app, spf, dkim });
      response.status(403).send('Rejected');
      return;
    }
    if (dkim !== 'pass') log('authUnverified', { spf, dkim });
    const firestore = getFirestore();
    const owner = await firestore.doc(config.tokenPath(token)).get();
    const uid = owner.data()?.uid;
    if (typeof uid !== 'string' || uid === '') {
      response.status(404).send('No such address');
      return;
    }
    if (!(await config.isOpenFor(uid))) {
      response.status(404).send('No such address');
      return;
    }
    const now = Date.now();
    const messageId = asString(body.messageId, 998).trim() || null;
    const eventId =
      messageId === null
        ? randomBytes(16).toString('hex')
        : eventIdFor(uid, messageId);
    if (
      messageId !== null &&
      (await firestore.doc(config.eventPath(uid, eventId)).get()).exists
    ) {
      response.status(200).json({ outcome: 'duplicate' });
      return;
    }
    if (
      !(await takeRateSlot(
        firestore,
        config.ratePath(uid, hourKey(now)),
        now,
        config.maxPerHour,
      ))
    ) {
      logger.warn('email.rateLimited', { app: config.app });
      response.status(429).send('Too many');
      return;
    }
    const html = asString(body.html, MAX_BODY_BYTES);
    const text = asString(body.text, MAX_BODY_BYTES);
    const receivedAt =
      typeof body.receivedAt === 'number' &&
      Number.isFinite(body.receivedAt) &&
      Math.abs(body.receivedAt - now) < 2 * DAY_MS
        ? body.receivedAt
        : now;
    const mail: EmailMail = {
      to: asString(body.to, 320),
      from: asString(body.from, 320),
      subject: asString(body.subject, 1000),
      text: text.trim() !== '' ? text : htmlToText(html),
      receivedAt,
      isDkimPassed: dkim === 'pass',
    };
    const input: EmailHandlerInput = { firestore, uid, mail, eventId, now };
    const intakeRef = firestore.doc(config.intakePath(uid));
    try {
      const isConfirmation = isForwardingConfirmation(mail);
      if (isConfirmation) {
        const confirmation = readConfirmation(mail);
        await intakeRef.update({
          ...((await config.confirmationFields?.(input, confirmation)) ??
            confirmation),
          confirmAt: now,
          updatedAt: now,
        });
      }
      const { outcome } = isConfirmation
        ? ((await config.onConfirmation?.(input)) ?? { outcome: 'confirm' })
        : await config.handle(input);
      await intakeRef.update({ lastReceivedAt: now }).catch(() => undefined);
      log('handled', { outcome });
      response.status(200).json({ outcome });
    } catch (error) {
      if ((error as { code?: unknown })?.code === 6) {
        response.status(200).json({ outcome: 'duplicate' });
        return;
      }
      logger.error('email.failed', {
        app: config.app,
        name: (error as Error)?.name ?? 'Error',
      });
      response.status(500).send('Failed');
    }
  };
}
