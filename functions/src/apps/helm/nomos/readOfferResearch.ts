import {
  MAX_OFFERS_PER_TURN,
  OFFER_FROM_CAP,
  OFFER_LABEL_CAP,
  OFFER_OPTIONS_MAX,
  OFFER_OPTION_CAP,
  OFFER_PREFILL_CAP,
  OFFER_QUESTION_CAP,
  OFFER_SUBJECT_CAP,
  OFFER_WHY_CAP,
  PROJECT_NAME_CAP,
  type OfferQuestionInput,
  type OfferResearchCommand,
} from './commands.js';
import {
  LEAD_QUESTIONS_MAX,
  clampLeadDays,
  type LeadQuestionShape,
} from './researchAhead.js';

const SHAPES: readonly LeadQuestionShape[] = [
  'text',
  'pickOne',
  'pickMany',
  'amountRange',
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toWords = (value: unknown, cap: number) => {
  if (typeof value !== 'string') return null;
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat === '' ? null : flat.slice(0, cap).trim();
};

const toList = (value: unknown, cap: number, max: number) =>
  (Array.isArray(value) ? value : [])
    .flatMap((entry) => toWords(entry, cap) ?? [])
    .filter((entry, index, all) => all.indexOf(entry) === index)
    .slice(0, max);

const readQuestion = (value: unknown): OfferQuestionInput[] => {
  if (!isRecord(value)) return [];
  const label = toWords(value.label, OFFER_LABEL_CAP);
  const shape = SHAPES.find((entry) => entry === value.shape);
  if (!label || !shape) return [];
  const isPick = shape === 'pickOne' || shape === 'pickMany';
  const options = isPick
    ? toList(value.options, OFFER_OPTION_CAP, OFFER_OPTIONS_MAX)
    : [];
  if (isPick && options.length < 2) return [];
  const prefill = toList(value.prefill, OFFER_PREFILL_CAP, OFFER_OPTIONS_MAX);
  const kept = isPick
    ? prefill.filter((entry) => options.includes(entry))
    : prefill.slice(0, 1);
  return [
    {
      label,
      shape,
      options,
      prefill: shape === 'pickOne' ? kept.slice(0, 1) : kept,
      from: kept.length > 0 ? toWords(value.from, OFFER_FROM_CAP) : null,
      isInferred: kept.length > 0 && value.isInferred === true,
    },
  ];
};

/** The research offers a reply asks for, each with its words capped and its lead time settled; at most two a turn. */
export function readOfferResearch(items: unknown[]): OfferResearchCommand[] {
  return items
    .filter(isRecord)
    .filter((item) => item.kind === 'offerResearch')
    .flatMap((item): OfferResearchCommand[] => {
      const projectRef = toWords(item.projectRef, PROJECT_NAME_CAP);
      const subject = toWords(item.offerSubject, OFFER_SUBJECT_CAP);
      const question = toWords(item.offerQuestion, OFFER_QUESTION_CAP);
      if (!projectRef || !subject || !question) return [];
      return [
        {
          kind: 'offerResearch',
          projectRef,
          subject,
          question,
          whyNow: toWords(item.offerWhyNow, OFFER_WHY_CAP),
          leadDays: clampLeadDays(item.offerLeadDays),
          isDecision: item.offerIsDecision === true,
          questions: (Array.isArray(item.offerQuestions)
            ? item.offerQuestions
            : []
          )
            .flatMap(readQuestion)
            .slice(0, LEAD_QUESTIONS_MAX),
        },
      ];
    })
    .slice(0, MAX_OFFERS_PER_TURN);
}
