import SectionDivider from '@/components/SectionDivider';
import { formatDate, formatTime } from '@/utils/formatUtils';
import PosterCover from '@apps/a-list/components/shared/PosterCover';
import {
  joinNames,
  toPersonKey,
  type FriendMovieGroup,
  type FriendShowing,
} from '@apps/a-list/utils/friendShowings';

const MAX_COMPACT_ROWS = 3;

function getTimeLines(showings: FriendShowing[]) {
  const byTime = showings.reduce<Map<number, string[]>>((times, showing) => {
    const names = times.get(showing.showtimeAt) ?? [];
    const isListed = names.some(
      (name) => toPersonKey(name) === toPersonKey(showing.personName),
    );
    times.set(
      showing.showtimeAt,
      isListed ? names : [...names, showing.personName],
    );
    return times;
  }, new Map());

  const result = Array.from(byTime.entries())
    .sort(([left], [right]) => left - right)
    .map(([time, names]) => `${joinNames(names)} · ${formatTime(time)}`)
    .join(', ');
  return result;
}

function getSourceTags(showings: FriendShowing[]) {
  const byPerson = showings.reduce<
    Map<string, { name: string; snapshotAt: number | null }>
  >((people, showing) => {
    const key = toPersonKey(showing.personName);
    const current = people.get(key);
    if (
      current === undefined ||
      (current.snapshotAt !== null && showing.snapshotAt === null)
    ) {
      people.set(key, {
        name: showing.personName,
        snapshotAt: showing.snapshotAt,
      });
    }
    return people;
  }, new Map());

  const sources = Array.from(byPerson.values());
  if (sources.every(({ snapshotAt }) => snapshotAt === null)) return 'Live';

  const result = sources
    .map(({ name, snapshotAt }) =>
      snapshotAt === null
        ? `${name}: Live`
        : `${name}: Snapshot taken ${formatDate(snapshotAt)}`,
    )
    .join(' · ');
  return result;
}

interface FriendsDaySectionProps {
  groups: FriendMovieGroup[];
  /** The peek's shorter list: a few movies without the source tags. */
  isCompact?: boolean;
}

/** What friends have on a day, one read-only row per movie: who is going and when, and whether it came from a live link or a snapshot. */
function FriendsDaySection({
  groups,
  isCompact = false,
}: FriendsDaySectionProps) {
  if (groups.length === 0) return null;

  const shown = isCompact ? groups.slice(0, MAX_COMPACT_ROWS) : groups;

  return (
    <section className='space-y-1'>
      <SectionDivider label='From shared calendars' className='py-1' />
      <ul>
        {shown.map((group) => (
          <li key={group.title} className='flex items-center gap-2.5 py-1.5'>
            <span
              className={
                isCompact
                  ? 'h-12 w-8 shrink-0 overflow-hidden rounded-md'
                  : 'h-14 w-9 shrink-0 overflow-hidden rounded-lg shadow-sm'
              }
            >
              <PosterCover
                title={group.title}
                posterUrl={group.posterUrl}
                compact
              />
            </span>
            <div className='min-w-0 flex-1 space-y-0.5 text-left'>
              <p className='truncate text-sm font-medium'>{group.title}</p>
              <p className='text-muted-foreground text-xs text-pretty'>
                {getTimeLines(group.showings)}
              </p>
              {!isCompact && (
                <p className='text-muted-foreground/80 text-[11px]'>
                  {getSourceTags(group.showings)}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
      {isCompact && groups.length > MAX_COMPACT_ROWS && (
        <p className='text-muted-foreground text-xs'>
          +{groups.length - MAX_COMPACT_ROWS} more
        </p>
      )}
    </section>
  );
}

export default FriendsDaySection;
