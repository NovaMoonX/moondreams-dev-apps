import { toComparable } from '../../../vendor/optionMatchUtils.js';
import type { SealedPayload } from '../../../appKeys/seal.js';
import type { OfferResearchCommand } from './commands.js';
import {
  RESEARCH_OFFERS_PER_PROJECT,
  buildAheadBrief,
  computeOfferOn,
  type AheadOfferMeta,
  type LeadAnswer,
  type LeadQuestion,
} from './researchAhead.js';
import {
  RESEARCH_WORDS,
  planStart,
  toReplyLine,
  toStartFields,
  type ResearchUsageDoc,
} from './planResearch.js';
import {
  readResearchAllowance,
  readResearchArrival,
  type ResearchDepth,
} from './research.js';

/** The words the server writes for research offered ahead of a date; the device's own copies are in `HELM_COPY`. */
export const AHEAD_WORDS = {
  offered: (subject: string, project: string, weeks: number) =>
    `I'll offer to look into ${subject} ${weeks} ${weeks === 1 ? 'week' : 'weeks'} before ${project}`,
  noDate: (project: string) =>
    `I can offer research ahead once ${project} has a date`,
  full: (project: string) =>
    `${project} already has ${RESEARCH_OFFERS_PER_PROJECT} research offers`,
  duplicate: (subject: string, project: string) =>
    `I already have an offer to look into ${subject} for ${project}`,
  alreadyStarted: 'That look is already under way.',
  started: (subject: string, arrival: string) =>
    `Looking into ${subject}. ${arrival}`,
};

/** What an offer needs to know about the project it is for: its date and what it already offers. */
export interface OfferTarget {
  id: string;
  name: string;
  targetDate: number | null;
  offers: AheadOfferMeta[];
  /** Subjects already offered, in every state. */
  subjects: string[];
}

export interface AcceptedOffer {
  projectId: string;
  meta: AheadOfferMeta;
  ask: {
    subject: string;
    question: string;
    whyNow: string | null;
    isDecision: boolean;
    questions: LeadQuestion[];
    answers: null;
    brief: null;
  };
  line: string;
}

/** Decides which offers a turn may add: the project needs a date, room for another (every state counts) and no offer with the same subject. Refusals are code's lines, never an error. */
export function planOfferResearch(input: {
  commands: OfferResearchCommand[];
  targets: OfferTarget[];
  resolve: (projectRef: string) => string | null;
  newId: () => string;
  now: number;
}): { accepted: AcceptedOffer[]; notKept: string[] } {
  return input.commands.reduce<{
    accepted: AcceptedOffer[];
    notKept: string[];
  }>(
    (all, command) => {
      const projectId = input.resolve(command.projectRef);
      const target = input.targets.find((entry) => entry.id === projectId);
      if (!target) {
        return {
          ...all,
          notKept: [
            ...all.notKept,
            `I couldn't find a project called ${command.projectRef}`,
          ],
        };
      }
      const mine = all.accepted.filter(
        (entry) => entry.projectId === target.id,
      );
      const count = target.offers.length + mine.length;
      const subjects = [
        ...target.subjects,
        ...mine.map((entry) => entry.ask.subject),
      ];
      const refusal =
        target.targetDate === null
          ? AHEAD_WORDS.noDate(target.name)
          : count >= RESEARCH_OFFERS_PER_PROJECT
            ? AHEAD_WORDS.full(target.name)
            : subjects.some(
                  (subject) =>
                    toComparable(subject) === toComparable(command.subject),
                )
              ? AHEAD_WORDS.duplicate(command.subject, target.name)
              : null;
      if (refusal) return { ...all, notKept: [...all.notKept, refusal] };
      const id = input.newId();
      return {
        ...all,
        accepted: [
          ...all.accepted,
          {
            projectId: target.id,
            meta: {
              id,
              leadDays: command.leadDays,
              offerOn: computeOfferOn(target.targetDate, command.leadDays),
              state: 'waiting',
              declineCount: 0,
              nextEligibleOn: null,
              shownOn: null,
              researchId: null,
              toldAt: null,
              createdAt: input.now,
            },
            ask: {
              subject: command.subject,
              question: command.question,
              whyNow: command.whyNow,
              isDecision: command.isDecision,
              questions: command.questions.map((question) => ({
                ...question,
                id: input.newId(),
              })),
              answers: null,
              brief: null,
            },
            line: AHEAD_WORDS.offered(
              command.subject,
              target.name,
              Math.max(1, Math.round(command.leadDays / 7)),
            ),
          },
        ],
      };
    },
    { accepted: [], notKept: [] },
  );
}

export interface AheadStart {
  projectId: string;
  offerId: string;
  depth: ResearchDepth;
  when: 'now' | 'later';
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The readable `aheadOffer` of a capture the device wrote on a yes; anything else is no start. */
export function readAheadStart(capture: {
  arrivedVia?: unknown;
  aheadOffer?: unknown;
}): AheadStart | null {
  const offer = capture.aheadOffer;
  if (capture.arrivedVia !== 'researchAhead' || !isRecord(offer)) return null;
  const { projectId, offerId, depth, when } = offer;
  return typeof projectId === 'string' &&
    projectId !== '' &&
    typeof offerId === 'string' &&
    offerId !== '' &&
    (depth === 'light' || depth === 'thorough') &&
    (when === 'now' || when === 'later')
    ? { projectId, offerId, depth, when }
    : null;
}

/** The words of one offer as sealed on the project, with the brief the device wrote or, when it wrote none, the one the answers make; null when the offer has no words. */
export function readAheadAsk(
  words: Record<string, unknown>,
  offerId: string,
  depth: ResearchDepth,
): { subject: string; brief: string } | null {
  const asks = isRecord(words.aheadAsks) ? words.aheadAsks : {};
  const ask = asks[offerId];
  if (!isRecord(ask) || typeof ask.subject !== 'string') return null;
  const { subject } = ask;
  return {
    subject,
    brief:
      typeof ask.brief === 'string' && ask.brief.trim() !== ''
        ? ask.brief
        : buildAheadBrief({
            subject,
            questions: Array.isArray(ask.questions)
              ? (ask.questions as LeadQuestion[])
              : [],
            answers: isRecord(ask.answers)
              ? (ask.answers as Record<string, LeadAnswer>)
              : {},
            depth,
          }),
  };
}

export interface AheadStartPlan {
  create: { id: string; doc: Record<string, unknown> } | null;
  /** The project's offers after the start; null when nothing changes. */
  offers: AheadOfferMeta[] | null;
  usage: ResearchUsageDoc | null;
  line: string;
}

/** A yes on an offer, planned without a model: the item starts at once or waits for the coming night, and the project's offer records it. A project or offer that is not as the device left it (gone, not taken, already started) starts nothing. */
export function planAheadStart(input: {
  start: AheadStart;
  project: {
    offers: AheadOfferMeta[];
    ask: { subject: string; brief: string } | null;
  } | null;
  usage: ResearchUsageDoc;
  timeZone: string;
  now: number;
  nextNight: number;
  captureId: string;
  newId: () => string;
  seal: (fields: Record<string, unknown>) => SealedPayload;
}): AheadStartPlan {
  const { start, project } = input;
  const offer = project?.offers.find((entry) => entry.id === start.offerId);
  if (
    !project ||
    !project.ask ||
    !offer ||
    offer.state !== 'taken' ||
    offer.researchId !== null
  ) {
    return {
      create: null,
      offers: null,
      usage: null,
      line: AHEAD_WORDS.alreadyStarted,
    };
  }
  const id = input.newId();
  const { subject } = project.ask;
  const isNow = start.when === 'now';
  const live = planStart({
    id,
    wanted: start.depth,
    usage: input.usage,
    now: input.now,
    timeZone: input.timeZone,
  });
  const base = {
    mode: 'leadTime',
    captureId: input.captureId,
    projectId: start.projectId,
    aheadOfferId: start.offerId,
    resultTopicId: null,
    searchesUsed: 0,
    costCents: 0,
    rerunOn: null,
    startedAt: null,
    preparedAt: null,
    cancelledAt: null,
    createdAt: input.now,
    lastEditedAt: null,
    sealed: input.seal({
      question: project.ask.brief,
      subject,
      overview: null,
      sources: [],
    }),
  };
  const doc = isNow
    ? { ...base, ...toStartFields(live, input.now) }
    : {
        ...base,
        status: 'planned',
        depth: start.depth,
        isWithoutWeb: false,
        reservedCents: 0,
        prepareAt: input.nextNight,
      };
  return {
    create: { id, doc },
    offers: project.offers.map((entry) =>
      entry.id === start.offerId ? { ...entry, researchId: id } : entry,
    ),
    usage: isNow && live.reservedCents > 0 ? live.usage : null,
    line: AHEAD_WORDS.started(
      subject,
      isNow
        ? toReplyLine({
            start: live,
            said: start.depth,
            isRerunBooked: false,
            thoroughResetOn: readResearchAllowance(
              input.usage,
              'thorough',
              input.now,
              input.timeZone,
            ).resetOn,
          })
        : RESEARCH_WORDS.arrival[readResearchArrival(start.depth, 'later')],
    ),
  };
}
