// Answers for the emulator: two fixture accounts, keyed by the account's email for the calendar list and by calendar id for events.

export interface FixtureContext {
  email: string | null;
}

export interface FixtureAnswer {
  status: number;
  body: unknown;
}

interface FixtureTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

interface FixtureEvent {
  id: string;
  status?: string;
  summary?: string;
  start?: FixtureTime;
  end?: FixtureTime;
  iCalUID?: string;
  attendees?: { self: boolean; responseStatus: string }[];
  transparency?: string;
  updated?: string;
}

const ZONE = 'America/Los_Angeles';
const DAY_MS = 86_400_000;
const PAGE_SIZE = 2;
export const FIXTURE_SYNC_TOKEN = 'fixture-sync';
export const FIXTURE_CHANGES_TOKEN = 'fixture-changes';
export const FIXTURE_GONE_TOKEN = 'fixture-gone';
export const FIXTURE_CANCELLED_REF = 'work@example.com|fx-old-meeting';
const NO_TOKEN_CALENDAR = 'team-work@group.calendar.google.com';

const CALENDARS_BY_EMAIL: Record<string, Record<string, unknown>[]> = {
  'personal@example.com': [
    {
      id: 'personal@example.com',
      summary: 'Personal',
      backgroundColor: '#9fe1e7',
      primary: true,
      accessRole: 'owner',
    },
    {
      id: 'en.usa#holiday@group.v.calendar.google.com',
      summary: 'Holidays in United States',
      backgroundColor: '#16a765',
      accessRole: 'reader',
    },
    {
      id: 'shifts-personal@group.calendar.google.com',
      summary: 'Shifts',
      summaryOverride: 'Shifts',
      backgroundColor: '#f83a22',
      accessRole: 'owner',
    },
  ],
  'work@example.com': [
    {
      id: 'work@example.com',
      summary: 'Work',
      backgroundColor: '#4986e7',
      primary: true,
      accessRole: 'owner',
    },
    {
      id: 'team-work@group.calendar.google.com',
      summary: 'Team',
      backgroundColor: '#b99aff',
      accessRole: 'reader',
    },
  ],
};

const dayAt = (offset: number) =>
  new Date(Date.parse(`${todayInZone()}T00:00:00Z`) + offset * DAY_MS)
    .toISOString()
    .slice(0, 10);

const todayInZone = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(Date.now());

const zoneOffset = (date: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    timeZoneName: 'longOffset',
  })
    .formatToParts(new Date(`${date}T12:00:00Z`))
    .find((part) => part.type === 'timeZoneName')
    ?.value.replace('GMT', '') || 'Z';

const at = (offset: number, time: string): FixtureTime => {
  const date = dayAt(offset);
  return {
    dateTime: `${date}T${time}:00${zoneOffset(date)}`,
    timeZone: ZONE,
  };
};

const allDay = (offset: number): { start: FixtureTime; end: FixtureTime } => ({
  start: { date: dayAt(offset) },
  end: { date: dayAt(offset + 1) },
});

const timed = (offset: number, from: string, to: string) => ({
  start: at(offset, from),
  end: at(offset, to),
});

const updatedLongAgo = () => new Date(Date.now() - 7 * DAY_MS).toISOString();

const eventsFor = (calendarId: string): FixtureEvent[] | null => {
  const base = { updated: updatedLongAgo() };
  const pottery = {
    ...base,
    summary: 'Pottery class',
    iCalUID: 'fixture-pottery@example.com',
    ...timed(2, '18:00', '19:30'),
  };
  const byCalendar: Record<string, FixtureEvent[]> = {
    'work@example.com': [
      {
        ...base,
        id: 'fx-standup',
        summary: 'Standup',
        iCalUID: 'fx-standup@example.com',
        ...timed(0, '09:00', '09:30'),
      },
      {
        ...base,
        id: 'fx-ooo',
        summary: 'Out of office',
        iCalUID: 'fx-ooo@example.com',
        transparency: 'transparent',
        ...allDay(0),
      },
      {
        ...base,
        id: 'fx-declined',
        summary: 'Planning sync',
        iCalUID: 'fx-declined@example.com',
        attendees: [{ self: true, responseStatus: 'declined' }],
        ...timed(0, '15:00', '16:00'),
      },
    ],
    'personal@example.com': [
      {
        ...base,
        id: 'fx-lunch',
        summary: 'Lunch with Sam',
        iCalUID: 'fx-lunch@example.com',
        ...timed(0, '12:30', '13:30'),
      },
      { ...pottery, id: 'fx-pottery' },
      {
        ...base,
        id: 'fx-dentist',
        status: 'tentative',
        summary: 'Dentist',
        iCalUID: 'fx-dentist@example.com',
        ...timed(3, '10:00', '11:00'),
      },
    ],
    'shifts-personal@group.calendar.google.com': [
      {
        ...base,
        id: 'fx-dinner-shift',
        summary: 'Dinner shift',
        iCalUID: 'fx-dinner-shift@example.com',
        ...timed(1, '18:00', '20:00'),
      },
      { ...pottery, id: 'fx-pottery-shifts' },
    ],
    'en.usa#holiday@group.v.calendar.google.com': [
      {
        ...base,
        id: 'fx-holiday',
        summary: 'Founders Day',
        iCalUID: 'fx-holiday@example.com',
        ...allDay(5),
      },
    ],
    [NO_TOKEN_CALENDAR]: [
      {
        ...base,
        id: 'fx-team-lunch',
        summary: 'Team lunch',
        iCalUID: 'fx-team-lunch@example.com',
        ...timed(1, '12:00', '13:00'),
      },
    ],
  };
  return Object.hasOwn(byCalendar, calendarId) ? byCalendar[calendarId] : null;
};

const answerEvents = (calendarId: string, params: URLSearchParams) => {
  const events = eventsFor(calendarId);
  if (!events) return { status: 404, body: {} };
  const syncToken = params.get('syncToken');
  if (syncToken === FIXTURE_GONE_TOKEN) return { status: 410, body: {} };
  if (syncToken === FIXTURE_CHANGES_TOKEN) {
    const changed =
      calendarId === 'work@example.com'
        ? [{ id: 'fx-old-meeting', status: 'cancelled' }]
        : [];
    return {
      status: 200,
      body: { items: changed, nextSyncToken: FIXTURE_SYNC_TOKEN },
    };
  }
  if (syncToken || params.get('updatedMin')) {
    return {
      status: 200,
      body: { items: [], nextSyncToken: FIXTURE_SYNC_TOKEN },
    };
  }
  const offset = Number(params.get('pageToken')?.slice(1) ?? 0);
  const next = offset + PAGE_SIZE;
  const isLast = next >= events.length;
  return {
    status: 200,
    body: {
      items: events.slice(offset, next),
      ...(isLast
        ? calendarId === NO_TOKEN_CALENDAR
          ? {}
          : { nextSyncToken: FIXTURE_SYNC_TOKEN }
        : { nextPageToken: `p${next}` }),
    },
  };
};

export const answerFixture = (
  url: string,
  context: FixtureContext,
): FixtureAnswer => {
  const parsed = new URL(url);
  const events = /^\/calendar\/v3\/calendars\/([^/]+)\/events$/.exec(
    parsed.pathname,
  );
  if (events)
    return answerEvents(decodeURIComponent(events[1]), parsed.searchParams);
  if (parsed.pathname === '/calendar/v3/users/me/calendarList') {
    const list =
      context.email !== null && Object.hasOwn(CALENDARS_BY_EMAIL, context.email)
        ? CALENDARS_BY_EMAIL[context.email]
        : [];
    return { status: 200, body: { items: list } };
  }
  return { status: 404, body: {} };
};
