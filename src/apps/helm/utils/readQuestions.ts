import type { HelmQuestion, UndoChoice, UndoReason } from '@apps/helm/types';

const isOption = (value: unknown) => {
  const option = value as Partial<HelmQuestion['options'][number]> | null;
  return (
    typeof option === 'object' &&
    option !== null &&
    typeof option.id === 'string' &&
    typeof option.label === 'string'
  );
};

const SHAPES = [
  'pickOne',
  'pickSeveral',
  'yesNo',
  'freeText',
  'dateTime',
  'pickRecord',
  'number',
];

const toRecordKinds = (value: unknown): HelmQuestion['recordKinds'] =>
  Array.isArray(value)
    ? value.filter(
        (kind): kind is 'who' | 'place' => kind === 'who' || kind === 'place',
      )
    : [];

const UNDO_REASONS: UndoReason[] = [
  'wrongThing',
  'wrongDetails',
  'tooHasty',
  'changedMind',
  'unclear',
];

/** The choices an undo offer holds, read from its held command; one that is not shaped like the contract is left out. */
const toUndoChoices = (question: {
  kind?: string;
  heldCommands?: unknown;
}): UndoChoice[] => {
  const held = Array.isArray(question.heldCommands)
    ? (question.heldCommands[0] as { kind?: unknown; choices?: unknown })
    : null;
  return question.kind === 'undoOffer' &&
    held?.kind === 'undoOffer' &&
    Array.isArray(held.choices)
    ? held.choices.flatMap((entry: Partial<UndoChoice> | null) =>
        entry &&
        typeof entry.optionId === 'string' &&
        typeof entry.executionId === 'string' &&
        Array.isArray(entry.docIds) &&
        entry.docIds.every((id) => typeof id === 'string') &&
        typeof entry.isAll === 'boolean' &&
        UNDO_REASONS.includes(entry.reason as UndoReason)
          ? [
              {
                optionId: entry.optionId,
                executionId: entry.executionId,
                docIds: entry.docIds,
                isAll: entry.isAll,
                reason: entry.reason as UndoReason,
                quote: typeof entry.quote === 'string' ? entry.quote : null,
              },
            ]
          : [],
      )
    : [];
};

/** Opens the questions a turn asked, in the shape the cards draw, filling what an older one lacks; one that is not shaped like the contract is left out. */
export const toQuestions = (value: unknown): Record<string, HelmQuestion> =>
  Object.fromEntries(
    Object.entries(
      typeof value === 'object' && value !== null ? value : {},
    ).flatMap(([id, entry]) => {
      const question = entry as Partial<HelmQuestion> | null;
      const isKnown =
        question?.kind === 'whichPerson' ||
        question?.kind === 'whichPlace' ||
        question?.kind === 'isThisWho' ||
        question?.kind === 'whichKin' ||
        question?.kind === 'kinOrder' ||
        question?.kind === 'whichIsTrue' ||
        question?.kind === 'whichTopic' ||
        question?.kind === 'groupTopics' ||
        question?.kind === 'whichComesFirst' ||
        question?.kind === 'undoOffer' ||
        question?.kind === 'researchDepth' ||
        question?.kind === 'researchRerun' ||
        question?.kind === 'asked';
      return typeof question === 'object' &&
        question !== null &&
        isKnown &&
        typeof question.prompt === 'string' &&
        Array.isArray(question.options) &&
        question.options.every(isOption)
        ? [
            [
              id,
              {
                ...question,
                builtBy: question.kind === 'asked' ? 'model' : 'code',
                shape: SHAPES.includes(question.shape ?? '')
                  ? question.shape
                  : 'pickOne',
                options: question.options.map((option) => ({
                  ...option,
                  detail: option.detail ?? null,
                  ref: option.ref ?? null,
                })),
                allowsSomethingElse: question.allowsSomethingElse ?? false,
                noneOption: question.noneOption ?? false,
                recordKinds: toRecordKinds(question.recordKinds),
                dateMode: question.dateMode ?? null,
                number: question.number ?? null,
                aboutRef: question.aboutRef ?? null,
                answer: question.answer ?? null,
                lead: typeof question.lead === 'string' ? question.lead : null,
                undoChoices: toUndoChoices(question),
              } as HelmQuestion,
            ],
          ]
        : [];
    }),
  );
