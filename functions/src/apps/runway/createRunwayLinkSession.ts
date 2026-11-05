import { logger } from 'firebase-functions';
import { onCall } from 'firebase-functions/v2/https';

import {
  LINK_CORS,
  LINK_SECRETS,
  provider,
  requireLinkCaller,
  withProvider,
} from './link/linkShared.js';

/** `{}` → `{ linkToken }`: a short-lived token the bank window opens with. */
export const createRunwayLinkSession = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    timeoutSeconds: 30,
    secrets: LINK_SECRETS,
    cors: LINK_CORS,
  },
  async (request) => {
    const uid = await requireLinkCaller(request);
    const { linkToken } = await withProvider(() =>
      provider.createLinkSession(uid),
    );
    logger.info('runway.link.sessionCreated');
    const result = { linkToken };
    return result;
  },
);
