const VISIT_TIME_BUCKETS = [
  { start: 5, end: 12, label: 'Morning' },
  { start: 12, end: 17, label: 'Afternoon' },
  { start: 17, end: 22, label: 'Evening' },
] as const;

export function getDefaultVisitTitle(scheduledAt: number): string {
  const date = new Date(scheduledAt);
  const hours = date.getHours();
  const bucket = VISIT_TIME_BUCKETS.find(({ start, end }) => hours >= start && hours < end);
  const timeOfDay = bucket?.label ?? 'Late Night';
  const formattedDate = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return `${timeOfDay} Visit — ${formattedDate}`;
}
