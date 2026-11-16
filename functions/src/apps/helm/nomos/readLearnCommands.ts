import type { AliasBook } from './aliases.js';
import {
  LEARN_CONTEXT_CAP,
  LEARN_DECLINE_REASONS,
  LEARN_NAME_CAP,
  LEARN_QUESTION_CAP,
  LEARN_SUBJECT_CAP,
  MAX_SAVES_PER_TURN,
  type DeclineLearnCommand,
  type LearnAsk,
  type LearnCommand,
  type OfferLearnGoalCommand,
  type ProjectCommand,
  type RelatedLearnCommand,
  type SaveForLaterCommand,
} from './commands.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toWords = (value: unknown, cap: number) => {
  if (typeof value !== 'string') return null;
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat === '' ? null : flat.slice(0, cap).trim();
};

const squash = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();

/** The person's words, kept only when the capture really holds them. */
const toQuote = (value: unknown, captureText: string) => {
  const quote = toWords(value, LEARN_QUESTION_CAP);
  return quote !== null && squash(captureText).includes(squash(quote))
    ? quote
    : null;
};

const IGNORED = new Set([
  'a',
  'an',
  'the',
  'to',
  'how',
  'what',
  'is',
  'are',
  'do',
  'does',
  'i',
  'my',
  'me',
  'want',
  'learn',
  'about',
  'of',
  'and',
  'or',
  'in',
  'on',
  'for',
  'it',
  'one',
  'day',
  'someday',
  'sometime',
  'get',
  'back',
  'into',
]);

const toTokens = (text: string) =>
  squash(text)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !IGNORED.has(word));

const hasOverlap = (first: string, second: string) => {
  const words = new Set(toTokens(first));
  return toTokens(second).some((word) => words.has(word));
};

export interface LearnCommands {
  commands: LearnCommand[];
  /** Saves code asks about instead of making, because the wish could be reading or practising. */
  asks: LearnAsk[];
}

/** The learn-later commands a reply carries, each with its words capped and each `r#` resolved against the book, so an unknown one is dropped. At most `MAX_SAVES_PER_TURN` saves, one pair to relate and one skill to offer; a save the model could not place, or that it called a goal, becomes an ask. */
export function readLearnCommands(
  items: unknown[],
  aliases: AliasBook,
  captureText: string,
): LearnCommands {
  const saves = items
    .filter(isRecord)
    .filter((item) => item.kind === 'saveForLater')
    .flatMap((item): SaveForLaterCommand[] => {
      const question = toWords(item.learnQuestion, LEARN_QUESTION_CAP);
      if (question === null) return [];
      return [
        {
          kind: 'saveForLater',
          question,
          subject:
            toWords(item.learnSubject, LEARN_SUBJECT_CAP) ??
            question.slice(0, LEARN_SUBJECT_CAP).trim(),
          contextLine: toWords(item.learnContext, LEARN_CONTEXT_CAP),
          needsLiveFacts: item.learnNeedsLiveFacts === true,
          practise:
            item.learnPractise === 'goal' || item.learnPractise === 'unclear'
              ? item.learnPractise
              : 'read',
          quote: toQuote(item.learnQuote, captureText),
        },
      ];
    })
    .filter(
      (save, index, all) =>
        all.findIndex(
          (other) => squash(other.subject) === squash(save.subject),
        ) === index,
    )
    .slice(0, MAX_SAVES_PER_TURN);
  const goals = items
    .filter(isRecord)
    .filter((item) => item.kind === 'offerLearnGoal')
    .flatMap((item): OfferLearnGoalCommand[] => {
      const name = toWords(item.learnGoalName, LEARN_NAME_CAP);
      return name === null
        ? []
        : [
            {
              kind: 'offerLearnGoal',
              name,
              quote: toQuote(item.learnQuote, captureText),
            },
          ];
    })
    .slice(0, 1);
  const declines = items
    .filter(isRecord)
    .filter((item) => item.kind === 'declineLearn')
    .flatMap((item): DeclineLearnCommand[] => {
      const itemId =
        typeof item.learnAlias === 'string'
          ? aliases.idOf(item.learnAlias)
          : null;
      if (itemId === null) return [];
      const reason =
        LEARN_DECLINE_REASONS.find((entry) => entry === item.learnReason) ??
        'timing';
      const question =
        reason === 'changedMind'
          ? toWords(item.learnQuestion, LEARN_QUESTION_CAP)
          : null;
      const subject =
        reason === 'changedMind'
          ? (toWords(item.learnSubject, LEARN_SUBJECT_CAP) ??
            question?.slice(0, LEARN_SUBJECT_CAP).trim() ??
            null)
          : null;
      return reason === 'changedMind' && question === null
        ? []
        : [{ kind: 'declineLearn', itemId, reason, question, subject }];
    })
    .filter(
      (decline, index, all) =>
        all.findIndex((other) => other.itemId === decline.itemId) === index,
    );
  const related = items
    .filter(isRecord)
    .filter((item) => item.kind === 'relatedLearn')
    .flatMap((item): RelatedLearnCommand[] => {
      const firstId =
        typeof item.learnAlias === 'string'
          ? aliases.idOf(item.learnAlias)
          : null;
      const secondId =
        typeof item.learnOtherAlias === 'string'
          ? aliases.idOf(item.learnOtherAlias)
          : null;
      const together = toWords(item.learnTogether, LEARN_SUBJECT_CAP);
      return firstId !== null &&
        secondId !== null &&
        firstId !== secondId &&
        together !== null
        ? [{ kind: 'relatedLearn', firstId, secondId, together }]
        : [];
    })
    .slice(0, 1);
  const asks = saves
    .filter((save) => save.practise !== 'read')
    .map((save): LearnAsk => ({
      question: save.question,
      subject: save.subject,
      contextLine: save.contextLine,
      needsLiveFacts: save.needsLiveFacts,
      goalName: null,
    }));
  return {
    commands: [
      ...saves.filter((save) => save.practise === 'read'),
      ...goals,
      ...declines,
      ...related,
    ],
    asks,
  };
}

/** Withholds a save and a goal the model made of the same wish: both are dropped and code asks which the person meant. A goal offered for a wish that is already a goal is dropped too. */
export function refuseDoubledGoals(
  learn: LearnCommands,
  projects: ProjectCommand[],
): { learn: LearnCommands; projects: ProjectCommand[] } {
  const goals = projects.flatMap((command) =>
    command.kind === 'createProject' && command.projectKind === 'goal'
      ? [command]
      : [],
  );
  const overlapped = (words: (string | null)[]) =>
    goals.filter((goal) =>
      words.some((text) => text !== null && hasOverlap(goal.name, text)),
    );
  const saves = learn.commands.filter(
    (command): command is SaveForLaterCommand =>
      command.kind === 'saveForLater',
  );
  const doubledSaves = saves.filter(
    (save) => overlapped([save.subject, save.question, save.quote]).length > 0,
  );
  const doubledAsks = learn.asks.filter(
    (ask) => overlapped([ask.subject, ask.question]).length > 0,
  );
  const doubledOffers = learn.commands.filter(
    (command) =>
      command.kind === 'offerLearnGoal' &&
      overlapped([command.name, command.quote]).length > 0,
  );
  if (
    doubledSaves.length + doubledAsks.length + doubledOffers.length === 0 ||
    goals.length === 0
  ) {
    return { learn, projects };
  }
  const withGoal = (ask: LearnAsk): LearnAsk => ({
    ...ask,
    goalName: overlapped([ask.subject, ask.question])[0]?.name ?? goals[0].name,
  });
  const toAsk = (save: SaveForLaterCommand): LearnAsk =>
    withGoal({
      question: save.question,
      subject: save.subject,
      contextLine: save.contextLine,
      needsLiveFacts: save.needsLiveFacts,
      goalName: null,
    });
  const dropped = new Set(
    [...doubledSaves, ...doubledAsks, ...doubledOffers].flatMap((entry) =>
      overlapped(
        'name' in entry
          ? [entry.name]
          : 'subject' in entry
            ? [entry.subject, entry.question]
            : [],
      ),
    ),
  );
  return {
    learn: {
      commands: learn.commands.filter(
        (command) =>
          !(doubledSaves as LearnCommand[]).includes(command) &&
          !(doubledOffers as LearnCommand[]).includes(command),
      ),
      asks: [
        ...learn.asks.map((ask) =>
          doubledAsks.includes(ask) ? withGoal(ask) : ask,
        ),
        ...doubledSaves.map(toAsk),
      ].slice(0, 1),
    },
    projects: projects.filter(
      (command) =>
        !(
          command.kind === 'createProject' &&
          dropped.has(command as (typeof goals)[number])
        ),
    ),
  };
}
