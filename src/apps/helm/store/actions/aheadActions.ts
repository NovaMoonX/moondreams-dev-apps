import { doc, runTransaction } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { store } from '@/store';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import { DAY_MS } from '@apps/helm/constants';
import {
  applyAheadNotNow,
  type AheadOfferMeta,
  type LeadAnswer,
} from '@apps/helm/engine/researchAhead';
import {
  clearSentTurn,
  getNextTurn,
  recordSentTurn,
} from '@apps/helm/hooks/useSession';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { openJson, sealJson } from '@apps/helm/security';
import { sendCapture } from '@apps/helm/store/actions/captureActions';
import type {
  AheadAsk,
  Project,
  ProjectSealed,
  Sealed,
} from '@apps/helm/types';
import {
  applyReadingEdits,
  readCapture,
} from '@apps/helm/utils/captureReading';

const projectRef = (uid: string, projectId: string) =>
  doc(db, 'apps', 'helm', 'users', uid, 'projects', projectId);

const liveProject = (projectId: string) =>
  store
    .getState()
    .helm.projects.items.find(
      (item) => item.id === projectId && !item.isUnreadable,
    ) ?? null;

/** Re-reads the project in one transaction and changes only this offer in the offers the server holds, so a research id it just set is kept; `change` answers null to leave it. Needs a connection. */
const changeOffer = (
  uid: string,
  projectId: string,
  offerId: string,
  change: (
    offer: AheadOfferMeta,
    targetDate: number | null,
  ) => AheadOfferMeta | null,
) => {
  const offers = liveProject(projectId)?.researchOffers ?? [];
  if (!offers.some((offer) => offer.id === offerId)) return null;
  const ref = projectRef(uid, projectId);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) return;
    const data = snapshot.data() as Project;
    const fresh = data.researchOffers ?? [];
    const current = fresh.find((offer) => offer.id === offerId);
    const next = current ? change(current, data.targetDate) : null;
    if (!next) return;
    transaction.update(ref, {
      researchOffers: fresh.map((offer) =>
        offer.id === offerId ? next : offer,
      ),
    });
  });
};

/** Stamps the day Today first showed an offer, so it is offered there once. */
export const markAheadShown = (
  uid: string,
  projectId: string,
  offerId: string,
  dayKey: string,
) => {
  const offer = liveProject(projectId)?.researchOffers.find(
    (one) => one.id === offerId,
  );
  if (!offer || offer.shownOn !== null) return null;
  return changeOffer(uid, projectId, offerId, (one) =>
    one.shownOn !== null ? null : { ...one, shownOn: dayKey },
  );
};

/** Not now on an offer: it waits, or turns off after the third. Returns the weeks it waits (null when it is off) and the write. */
export const notNowAhead = (
  uid: string,
  projectId: string,
  offerId: string,
  today: number,
) => {
  const project = liveProject(projectId);
  const offer = project?.researchOffers.find((one) => one.id === offerId);
  if (!project || !offer) return null;
  const next = applyAheadNotNow(offer, project.targetDate, today);
  const written = changeOffer(uid, projectId, offerId, (fresh, targetDate) =>
    fresh.state === 'waiting'
      ? applyAheadNotNow(fresh, targetDate, today)
      : null,
  );
  if (!written) return null;
  return {
    written,
    weeks:
      next.state === 'waiting' && next.nextEligibleOn !== null
        ? Math.round((next.nextEligibleOn - today) / (7 * DAY_MS))
        : null,
  };
};

/** The person has seen that the look is ready. */
export const setAheadTold = (uid: string, projectId: string, offerId: string) =>
  changeOffer(uid, projectId, offerId, (offer) => ({
    ...offer,
    toldAt: Date.now(),
  }));

export interface AheadSend {
  projectId: string;
  offerId: string;
  ask: AheadAsk;
  answers: Record<string, LeadAnswer>;
  brief: string;
  depth: 'light' | 'thorough';
  isNow: boolean;
  assistantName: string;
}

/** Thrown when the offer is no longer waiting by the time the answers are sent. */
export class AheadAnsweredError extends Error {
  constructor() {
    super('That offer was already answered.');
  }
}

/** Sends the answers and the brief as one turn the server turns into the research, and marks the offer taken with the sealed answers, in one transaction that re-reads the project and refuses an offer already answered. Needs a connection: it settles once the server has both writes, and a failure leaves the offer waiting and the turn unsent. */
export async function sendAheadOffer(uid: string, input: AheadSend) {
  const encryption = await getHelmEncryption(uid);
  const ref = projectRef(uid, input.projectId);
  const timeZone =
    store.getState().helm.profile?.timeZone ?? getDeviceTimeZone() ?? 'UTC';
  const next = { ...getNextTurn(), leadId: null, createdAt: Date.now() };
  const reading = applyReadingEdits(
    readCapture(input.brief, {
      now: next.createdAt,
      timeZone,
      assistantName: input.assistantName,
    }),
    { dismissed: [], days: {}, timeZone },
  );
  const { write, id } = await sendCapture(uid, encryption, {
    text: input.brief,
    reading,
    screen: null,
    answersQuestion: null,
    questionAnswer: null,
    ...next,
    ahead: {
      offer: {
        projectId: input.projectId,
        offerId: input.offerId,
        depth: input.depth,
        when: input.isNow ? 'now' : 'later',
      },
      commit: (captureRef, capture) =>
        runTransaction(db, async (transaction) => {
          const snapshot = await transaction.get(ref);
          if (!snapshot.exists()) throw new Error('This project is gone.');
          const data = snapshot.data() as Project;
          const offers = data.researchOffers ?? [];
          if (
            !offers.some(
              (offer) =>
                offer.id === input.offerId && offer.state === 'waiting',
            )
          ) {
            throw new AheadAnsweredError();
          }
          const opened = await openJson<ProjectSealed>(
            data.sealed as Sealed,
            encryption,
          );
          const sealed = await sealJson<ProjectSealed>(
            {
              ...opened,
              aheadAsks: {
                ...(opened.aheadAsks ?? {}),
                [input.offerId]: {
                  ...input.ask,
                  answers: input.answers,
                  brief: input.brief,
                },
              },
            },
            encryption,
          );
          transaction.set(captureRef, capture);
          transaction.update(ref, {
            researchOffers: offers.map((offer) =>
              offer.id === input.offerId
                ? { ...offer, state: 'taken' as const }
                : offer,
            ),
            sealed,
          });
        }),
    },
  });
  recordSentTurn(uid, next, id);
  try {
    await write;
  } catch (error) {
    clearSentTurn(uid, id);
    throw error;
  }
  return { id };
}
