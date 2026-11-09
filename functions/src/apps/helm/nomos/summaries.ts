const plural = (count: number, one: string, many: string) =>
  count === 1 ? one : many;

const describeCompleted = (count: number, isAfterOthers: string | null) => {
  if (!count) return null;
  if (isAfterOthers) return `marked ${count} done`;
  return plural(count, 'marked a task done', `marked ${count} tasks done`);
};

export interface EffectCounts {
  made: number;
  updated: number;
  completed: number;
}

/** A code template with no name or tone, past tense: "Made 2 tasks and marked 1 done". */
export function summarize(counts: EffectCounts): string {
  const made = counts.made
    ? plural(counts.made, 'made a task', `made ${counts.made} tasks`)
    : null;
  const updated = counts.updated
    ? plural(
        counts.updated,
        'updated a task',
        `updated ${counts.updated} tasks`,
      )
    : null;
  const completed = describeCompleted(counts.completed, made || updated);
  const parts = [made, updated, completed].filter(
    (part): part is string => part !== null,
  );
  const joined =
    parts.length < 2
      ? (parts[0] ?? '')
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

export type CodeQuestionKind = 'couldNotRead' | 'moreToSort';

/** Fixed wording for the two questions code asks when a capture is not fully sorted. */
export const CODE_QUESTION_WORDS: Record<
  CodeQuestionKind,
  { prompt: string; options: { id: string; label: string }[] }
> = {
  couldNotRead: {
    prompt: "This one didn't turn into a task yet. What would you like to do?",
    options: [
      { id: 'makeTask', label: 'Make it a task as written' },
      { id: 'delete', label: 'Delete it' },
    ],
  },
  moreToSort: {
    prompt: 'That was a lot at once. The rest is still waiting to be sorted.',
    options: [
      { id: 'sortRest', label: 'Sort the rest' },
      { id: 'leave', label: 'Leave it for now' },
    ],
  },
};

/** The sealed half of a code-built question: no held commands, nothing it is about, and no answer until one is given. */
export const buildCodeQuestion = (kind: CodeQuestionKind) => ({
  kind,
  builtBy: 'code' as const,
  shape: 'pickOne' as const,
  prompt: CODE_QUESTION_WORDS[kind].prompt,
  options: CODE_QUESTION_WORDS[kind].options.map((option) => ({
    ...option,
    detail: null,
    ref: null,
  })),
  allowsSomethingElse: false,
  noneOption: false,
  recordKinds: [],
  dateMode: null,
  number: null,
  heldCommands: [],
  aboutRef: null,
  answer: null,
});
