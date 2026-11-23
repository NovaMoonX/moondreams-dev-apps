import { normalizeString } from '@/utils/stringUtils';
import type {
  AddedCalendar,
  ShareFeed,
  ShareKind,
  SharedViewing,
  Viewing,
} from '@apps/a-list/types';
import { getDayKey } from '@apps/a-list/utils/dayKeys';

/** Where one added share's feed stands: still opening, open, or ended because its link was deleted or its PIN changed. */
export type AddedFeedState =
  | { status: 'loading' }
  | { status: 'ok'; feed: ShareFeed }
  | { status: 'ended' };

export interface SharedPerson {
  personName: string;
  links: { calendar: AddedCalendar; feedState: AddedFeedState }[];
  /** On when any of the person's links is shown. */
  isShown: boolean;
  hasEnded: boolean;
}

/** One friend's showing, after their links' duplicates are folded together (the live copy wins). */
export interface FriendShowing {
  personName: string;
  title: string;
  posterUrl: string | null;
  showtimeAt: number;
  theatreName: string | null;
  kind: ShareKind;
  /** When the snapshot it came from was made; null when it came through a live link. */
  snapshotAt: number | null;
}

/** Everyone planning one movie on one day. */
export interface FriendMovieGroup {
  title: string;
  posterUrl: string | null;
  showings: FriendShowing[];
}

export const toPersonKey = (name: string) => normalizeString(name);

/** The people in order of name, each with every link added under that name. */
export function groupSharedPeople(
  calendars: AddedCalendar[],
  feeds: Record<string, AddedFeedState>,
): SharedPerson[] {
  const byPerson = calendars.reduce<Map<string, SharedPerson>>((people, calendar) => {
    const key = toPersonKey(calendar.personName);
    const feedState = feeds[calendar.id] ?? { status: 'loading' };
    const current = people.get(key) ?? {
      personName: calendar.personName,
      links: [],
      isShown: false,
      hasEnded: false,
    };
    people.set(key, {
      ...current,
      links: [...current.links, { calendar, feedState }],
      isShown: current.isShown || calendar.isShown,
      hasEnded: current.hasEnded || feedState.status === 'ended',
    });
    return people;
  }, new Map());

  const result = Array.from(byPerson.values()).sort((left, right) =>
    left.personName.localeCompare(right.personName),
  );
  return result;
}

/** The person already using this name, matched without case or extra spaces; null when the name is free. */
export function findPersonByName(people: SharedPerson[], name: string) {
  const key = toPersonKey(name);
  const result = people.find((person) => toPersonKey(person.personName) === key) ?? null;
  return result;
}

const toShowingKey = (personName: string, viewing: SharedViewing) =>
  [toPersonKey(personName), normalizeString(viewing.title), viewing.showtimeAt, normalizeString(viewing.theatreName ?? '')].join('|');

/** Every shown friend's showings, with the same showing reached through two of one person's links counted once. */
export function collectFriendShowings(people: SharedPerson[]): FriendShowing[] {
  const entries = people.flatMap((person) =>
    person.links.flatMap(({ calendar, feedState }) => {
      if (!calendar.isShown || feedState.status !== 'ok') return [];
      const { feed } = feedState;
      return feed.viewings.map((viewing) => ({
        key: toShowingKey(person.personName, viewing),
        showing: {
          personName: person.personName,
          title: viewing.title,
          posterUrl: viewing.posterUrl,
          showtimeAt: viewing.showtimeAt,
          theatreName: viewing.theatreName,
          kind: feed.kind,
          snapshotAt: feed.kind === 'LIVE' ? null : feed.createdAt,
        } satisfies FriendShowing,
      }));
    }),
  );

  const byKey = entries.reduce<Map<string, FriendShowing>>((kept, { key, showing }) => {
    const current = kept.get(key);
    if (current === undefined || (current.kind === 'SNAPSHOT' && showing.kind === 'LIVE')) {
      kept.set(key, showing);
    }
    return kept;
  }, new Map());

  const result = Array.from(byKey.values()).sort((left, right) => left.showtimeAt - right.showtimeAt);
  return result;
}

/** Friends' showings on each local day, grouped by movie so everyone seeing it that day reads as one line. */
export function groupFriendShowingsByDay(showings: FriendShowing[]) {
  const result = showings.reduce<Map<string, FriendMovieGroup[]>>((days, showing) => {
    const dayKey = getDayKey(showing.showtimeAt);
    const groups = days.get(dayKey) ?? [];
    const titleKey = normalizeString(showing.title);
    const match = groups.find((group) => normalizeString(group.title) === titleKey);
    const nextGroups = match
      ? groups.map((group) =>
          group === match
            ? { ...group, posterUrl: group.posterUrl ?? showing.posterUrl, showings: [...group.showings, showing] }
            : group,
        )
      : [...groups, { title: showing.title, posterUrl: showing.posterUrl, showings: [showing] }];
    days.set(dayKey, nextGroups);
    return days;
  }, new Map());
  return result;
}

/** How many different friends have something on a day. */
export function countFriendsOnDay(groups: FriendMovieGroup[] | undefined) {
  if (!groups) return 0;
  const names = new Set(groups.flatMap((group) => group.showings.map((showing) => toPersonKey(showing.personName))));
  return names.size;
}

/** The friends seeing the same movie as one of the member's own showings that day. */
export function getFriendsAlsoGoing(
  viewing: Viewing,
  groupsByDay: Map<string, FriendMovieGroup[]>,
): string[] {
  const groups = groupsByDay.get(getDayKey(viewing.showtimeAt)) ?? [];
  const titleKey = normalizeString(viewing.movie.title);
  const group = groups.find((item) => normalizeString(item.title) === titleKey);
  if (!group) return [];

  const result = Array.from(new Set(group.showings.map((showing) => showing.personName)));
  return result;
}

/** "Sam", "Sam and Anna", "Sam, Anna and Fred". */
export function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? '';

  const result = `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return result;
}
