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
