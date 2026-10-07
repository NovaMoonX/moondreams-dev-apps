import {
  ACTIVITY_SETTING_LABELS,
  CHECKLIST_CATEGORY_EMOJIS,
  CHECKLIST_CATEGORY_LABELS,
  EVENT_TYPE_EMOJIS,
  EVENT_TYPE_LABELS,
  IDEA_TYPE_EMOJIS,
  MEAL_TYPE_LABELS,
  STAY_TYPE_EMOJIS,
  TRANSIT_TYPE_EMOJIS,
} from '@apps/waypoint/constants';
import type { ChecklistItem, Rental, Stay, TimelineEvent, TripIdea, TripSpace } from '@apps/waypoint/types';
import { getEventAttendeeIds } from '@apps/waypoint/utils/attendeeCalculators';
import { getLogisticsEntries, toMinutes } from '@apps/waypoint/utils/timelineLogistics';
import { getTransitSummary } from '@apps/waypoint/utils/transitDetails';
import {
  formatEventTimeRange,
  formatRentalTimeRange,
  formatStayTimeRange,
  getEventTime,
} from '@apps/waypoint/utils/tripTime';
import { getCityLabel } from '@/lib/cities/cityApi';
import { getDayCount, getDayDateLabel, getDayLabel } from '@/utils/dateRangeUtils';
import { formatClockTime, formatDateUTC } from '@/utils/formatUtils';
import { formatTimezoneLabel } from '@/utils/timezoneUtils';

export interface TimelineMarkdownSource {
  trip: TripSpace;
  events: TimelineEvent[];
  stays: Stay[];
  rentals: Rental[];
  /** Display names by uid; a member with no name reads as "Trip member". */
  memberNames: Record<string, string>;
}

export interface TripMarkdownSource extends TimelineMarkdownSource {
  checklist: ChecklistItem[];
  ideas: TripIdea[];
}

interface DayRow {
  minutes: number;
  lines: string[];
}

const NO_DAY = 'none';

const heading = (level: number, text: string) => `${'#'.repeat(level)} ${text}`;
const bullet = (text: string, depth = 0) => `${'  '.repeat(depth)}- ${text}`;
const quote = (text: string, depth: number) =>
  text.split('\n').map((line) => `${'  '.repeat(depth)}> ${line}`.trimEnd());
const nameOf = (names: Record<string, string>, uid: string) => names[uid]?.trim() || 'Trip member';
const MAX_LISTED_NAMES = 10;
const nameList = (names: Record<string, string>, uids: string[]) =>
  uids.length > MAX_LISTED_NAMES
    ? `${uids.slice(0, MAX_LISTED_NAMES).map((uid) => nameOf(names, uid)).join(', ')} and ${uids.length - MAX_LISTED_NAMES} more`
    : uids.map((uid) => nameOf(names, uid)).join(', ');
const withTime = (time: string | null) => (time ? `**${time}** ` : '');
const compact = (lines: (string | null | undefined | false)[]) => lines.filter((line): line is string => Boolean(line));

function getTripFacts({ trip }: Pick<TimelineMarkdownSource, 'trip'>) {
  const dayCount = getDayCount(trip.startDate, trip.endDate);
  return compact([
    `📅 ${formatDateUTC(trip.startDate)} – ${formatDateUTC(trip.endDate)} (${dayCount} ${dayCount === 1 ? 'day' : 'days'})`,
    trip.city && `📍 ${getCityLabel(trip.city)}`,
    trip.timezone && `🕒 ${formatTimezoneLabel(trip.timezone)}`,
  ]);
}

function getEventRow({ trip, memberNames }: TimelineMarkdownSource, event: TimelineEvent): DayRow {
  const details = event.eventDetails;
  const transitType = details && 'transitType' in details ? details.transitType : null;
  const { startMs, endMs, startTime } = getEventTime(trip, event);
  const impliedDurationMs = startMs !== null && endMs !== null && endMs > startMs ? endMs - startMs : null;
  const memberIds = Object.keys(trip.members);
  const attendeeIds = getEventAttendeeIds(event, memberIds).filter((uid) => memberIds.includes(uid));
  const kind = compact([
    details && 'mealType' in details && [MEAL_TYPE_LABELS[details.mealType] ?? details.mealType, ...(details.cuisines ?? [])].join(' · '),
    details && 'settings' in details && details.settings.map((setting) => ACTIVITY_SETTING_LABELS[setting] ?? setting).join(' / '),
  ])[0];
  const transitLines =
    transitType && details && 'transitDetails' in details
      ? getTransitSummary(transitType, details.transitDetails, event.title, impliedDurationMs).map(
          ({ label, value }) => `${label}: ${value}`,
        )
      : [];
  const title = event.title.trim() || event.locationName || EVENT_TYPE_LABELS[event.eventType];
  const emoji = (transitType && TRANSIT_TYPE_EMOJIS[transitType]) || EVENT_TYPE_EMOJIS[event.eventType];
  const detailLines = compact([
    kind,
    [event.locationName, event.address].filter(Boolean).join(' · '),
    ...transitLines,
    event.venueOpenTime &&
      event.venueCloseTime &&
      `Open ${formatClockTime(event.venueOpenTime)} – ${formatClockTime(event.venueCloseTime)}`,
    attendeeIds.length < memberIds.length &&
      `For: ${attendeeIds.length > 0 ? nameList(memberNames, attendeeIds) : 'nobody yet'}`,
    event.linkUrl,
  ]);
  const lines = [
    bullet(`${withTime(formatEventTimeRange(trip, event))}${emoji} ${title}`),
    ...detailLines.map((line) => bullet(line, 1)),
    ...(event.notes?.trim() ? quote(event.notes.trim(), 1) : []),
  ];
  return { minutes: toMinutes(startTime) ?? 0, lines };
}

function getLogisticsRows({ trip, stays, rentals }: TimelineMarkdownSource) {
  const staysById = new Map(stays.map((stay) => [stay.id, stay]));
  const rentalsById = new Map(rentals.map((rental) => [rental.id, rental]));
  return getLogisticsEntries(trip, stays, rentals).map((entry): { dayIndex: number; row: DayRow } => {
    const stay = entry.subject.kind === 'STAY' ? staysById.get(entry.subject.id) : undefined;
    const rental = entry.subject.kind === 'RENTAL' ? rentalsById.get(entry.subject.id) : undefined;
    const isReturn = entry.key.endsWith('-return');
    const address = stay?.address ?? (isReturn ? (rental?.returnAddress ?? rental?.pickupAddress) : rental?.pickupAddress);
    const code = (stay ?? rental)?.confirmationCode;
    const detailLines = compact([address, code && `Confirmation: ${code}`]);
    const lines = [
      bullet(`${withTime(entry.time ? formatClockTime(entry.time) : null)}${entry.emoji} ${entry.verb} · ${entry.name}`),
      ...detailLines.map((line) => bullet(line, 1)),
    ];
    return { dayIndex: entry.dayIndex, row: { minutes: toMinutes(entry.time) ?? -1, lines } };
  });
}

function buildTimelineSections(source: TimelineMarkdownSource, level: number): string[] {
  const { trip, events } = source;
  const dayCount = getDayCount(trip.startDate, trip.endDate);
  const eventRows = events
    .filter((event) => !event.isArchived)
    .map((event) => ({ dayIndex: event.dayIndex ?? null, row: getEventRow(source, event) }));
  const byDay = [...eventRows, ...getLogisticsRows(source)].reduce(
    (days, { dayIndex, row }) => days.set(dayIndex ?? NO_DAY, [...(days.get(dayIndex ?? NO_DAY) ?? []), row]),
    new Map<number | typeof NO_DAY, DayRow[]>(),
  );
  const orderedKeys = [...byDay.keys()].sort(
    (first, second) =>
      Number(first === NO_DAY) - Number(second === NO_DAY) ||
      (first === NO_DAY || second === NO_DAY ? 0 : Number(first) - Number(second)),
  );
  const sections = orderedKeys.map((key) => {
    const rows = [...(byDay.get(key) ?? [])].sort((first, second) => first.minutes - second.minutes);
    const title = key === NO_DAY ? 'No specific day' : getDayLabel(trip.startDate, key, dayCount);
    return [heading(level, title), '', ...rows.flatMap((row) => row.lines)].join('\n');
  });
  return sections.length > 0 ? sections : ['_Nothing planned yet._'];
}

function buildStaySections({ trip, stays }: TimelineMarkdownSource) {
  const lines = stays.flatMap((stay) => {
    const range = formatStayTimeRange(trip, stay).trim();
    return [
      bullet(`${STAY_TYPE_EMOJIS[stay.stayType]} **${stay.name}**${range.length > 1 ? ` — ${range}` : ''}`),
      ...compact([stay.address, stay.confirmationCode && `Confirmation: ${stay.confirmationCode}`, stay.linkUrl]).map(
        (line) => bullet(line, 1),
      ),
      ...(stay.notes?.trim() ? quote(stay.notes.trim(), 1) : []),
    ];
  });
  return lines;
}

function buildRentalSections({ trip, rentals }: TimelineMarkdownSource) {
  const lines = rentals.flatMap((rental) => {
    const range = formatRentalTimeRange(trip, rental).trim();
    return [
      bullet(`🚘 **${rental.name}**${rental.vehicle ? ` (${rental.vehicle})` : ''}${range.length > 1 ? ` — ${range}` : ''}`),
      ...compact([
        rental.pickupAddress && `Pick up: ${rental.pickupAddress}`,
        rental.returnAddress && `Return: ${rental.returnAddress}`,
        rental.confirmationCode && `Confirmation: ${rental.confirmationCode}`,
        rental.linkUrl,
      ]).map((line) => bullet(line, 1)),
      ...(rental.notes?.trim() ? quote(rental.notes.trim(), 1) : []),
    ];
  });
  return lines;
}

function buildChecklistSections({ trip, memberNames, checklist }: TripMarkdownSource, level: number) {
  const dayCount = getDayCount(trip.startDate, trip.endDate);
  const byCategory = checklist.reduce(
    (groups, item) => {
      const label = item.category === 'OTHER' && item.customCategoryLabel ? item.customCategoryLabel : CHECKLIST_CATEGORY_LABELS[item.category];
      const key = `${CHECKLIST_CATEGORY_EMOJIS[item.category]} ${label}`;
      return groups.set(key, [...(groups.get(key) ?? []), item]);
    },
    new Map<string, ChecklistItem[]>(),
  );
  return [...byCategory.entries()].map(([title, items]) =>
    [
      heading(level, title),
      '',
      ...items.flatMap((item) => {
        const extras = compact([
          item.completeByDayIndex !== null && `due ${getDayLabel(trip.startDate, item.completeByDayIndex, dayCount)}`,
          item.assignedToUids.length > 0 && nameList(memberNames, item.assignedToUids),
        ]);
        return [
          `- [${item.isCompleted ? 'x' : ' '}] ${item.title}${extras.length > 0 ? ` (${extras.join(' · ')})` : ''}`,
          ...(item.note?.trim() ? quote(item.note.trim(), 1) : []),
        ];
      }),
    ].join('\n'),
  );
}

function buildIdeaLines({ ideas }: TripMarkdownSource) {
  const lines = ideas
    .filter((idea) => idea.convertedToEntityId === null)
    .flatMap((idea) => [
      bullet(
        `${IDEA_TYPE_EMOJIS[idea.ideaType]} **${idea.title}**${idea.voterUids.length > 0 ? ` — ${idea.voterUids.length} ${idea.voterUids.length === 1 ? 'vote' : 'votes'}` : ''}`,
      ),
      ...compact([idea.linkUrl]).map((line) => bullet(line, 1)),
      ...(idea.notes?.trim() ? quote(idea.notes.trim(), 1) : []),
    ]);
  return lines;
}

const section = (title: string, body: string[]) => (body.length > 0 ? [heading(2, title), '', ...body, ''] : []);

/** The timeline as Markdown: one heading per day, stays and rentals placed by time among the plans. */
export function buildTimelineMarkdown(source: TimelineMarkdownSource): string {
  const { trip } = source;
  const dayCount = getDayCount(trip.startDate, trip.endDate);
  const result = [
    heading(1, `${trip.title} — Timeline`),
    '',
    `${getDayDateLabel(trip.startDate, 0)} – ${getDayDateLabel(trip.startDate, dayCount - 1)}`,
    '',
    ...buildTimelineSections(source, 2).flatMap((block) => [block, '']),
  ]
    .join('\n')
    .trimEnd();
  return `${result}\n`;
}

/** The whole trip as Markdown. Expenses and dues are left out on purpose: they are money, and some are private. */
export function buildTripMarkdown(source: TripMarkdownSource): string {
  const { trip, memberNames } = source;
  const memberIds = Object.keys(trip.members);
  const lines = [
    heading(1, trip.title),
    '',
    ...getTripFacts(source).map((fact) => bullet(fact)),
    ...(memberIds.length > 0 ? [bullet(`👥 ${nameList(memberNames, memberIds)}`)] : []),
    '',
    heading(2, 'Timeline'),
    '',
    ...buildTimelineSections(source, 3).flatMap((block) => [block, '']),
    ...section('Stays', buildStaySections(source)),
    ...section('Car rentals', buildRentalSections(source)),
    ...(source.checklist.length > 0 ? [heading(2, 'Checklist'), '', ...buildChecklistSections(source, 3).flatMap((block) => [block, ''])] : []),
    ...section('Ideas', buildIdeaLines(source)),
  ];
  const result = lines.join('\n').trimEnd();
  return `${result}\n`;
}
