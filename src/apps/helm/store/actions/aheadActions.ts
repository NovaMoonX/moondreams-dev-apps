import { doc, getDoc, updateDoc } from 'firebase/firestore';

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

/** Writes the project's offers with one of them changed, from the offers the device holds now; the write is handed back unawaited so it works offline. */
const changeOffer = (
  uid: string,
  projectId: string,
  offerId: string,
  change: (offer: AheadOfferMeta) => AheadOfferMeta,
) => {
  const offers = liveProject(projectId)?.researchOffers ?? [];
  if (!offers.some((offer) => offer.id === offerId)) return null;
  return updateDoc(projectRef(uid, projectId), {
    researchOffers: offers.map((offer) =>
      offer.id === offerId ? change(offer) : offer,
    ),
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
  return changeOffer(uid, projectId, offerId, (one) => ({
    ...one,
    shownOn: dayKey,
  }));
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
  const written = changeOffer(uid, projectId, offerId, () => next);
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

/** Sends the answers and the brief as one turn the server turns into the research, and marks the offer taken with the sealed answers, in one batch. The write is handed back unawaited. */
export async function sendAheadOffer(uid: string, input: AheadSend) {
  const encryption = await getHelmEncryption(uid);
  const ref = projectRef(uid, input.projectId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) throw new Error('This project is gone.');
  const data = snapshot.data() as Project;
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
  const offers = (data.researchOffers ?? []).map((offer) =>
    offer.id === input.offerId ? { ...offer, state: 'taken' as const } : offer,
  );
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
      alsoWrite: (batch) =>
        batch.update(ref, { researchOffers: offers, sealed }),
    },
  });
  recordSentTurn(uid, next, id);
  void write.catch(() => clearSentTurn(uid, id));
  return { write, id };
}
