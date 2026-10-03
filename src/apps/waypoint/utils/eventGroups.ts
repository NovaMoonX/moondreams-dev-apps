import type { EventType, TimelineEvent } from '@apps/waypoint/types';

export interface EventGroup {
  kind: 'group';
  key: string;
  label: string;
  eventType: EventType;
  events: TimelineEvent[];
}

export interface SingleEvent {
  kind: 'event';
  event: TimelineEvent;
}

export type EventListItem = EventGroup | SingleEvent;

const getGroupKey = (event: TimelineEvent) =>
  event.groupLabel?.trim() ? `${event.eventType}::${event.groupLabel.trim().toLowerCase()}` : null;

/** Collapses events sharing a type and group label into one entry placed where the first
 * member sits. A label held by a single event stays a plain event — there is nothing to nest. */
export function groupEventsByLabel(events: TimelineEvent[]): EventListItem[] {
  const members = events.reduce<Record<string, TimelineEvent[]>>((acc, event) => {
    const key = getGroupKey(event);
    return key ? { ...acc, [key]: [...(acc[key] ?? []), event] } : acc;
  }, {});

  const items = events.flatMap<EventListItem>((event) => {
    const key = getGroupKey(event);
    const group = key ? members[key] : null;
    if (!key || !group || group.length < 2) {
      return [{ kind: 'event', event }];
    }
    if (group[0].id !== event.id) {
      return [];
    }
    return [
      {
        kind: 'group',
        key,
        label: event.groupLabel?.trim() ?? '',
        eventType: event.eventType,
        events: group,
      },
    ];
  });
  return items;
}

export interface EventStack {
  kind: 'stack';
  key: string;
  label: string;
  eventType: EventType;
  /** One itinerary per entry: a group of legs, or a single event. */
  members: (EventGroup | SingleEvent)[];
  events: TimelineEvent[];
}

export type TimelineItem = EventStack | EventGroup | SingleEvent;

const getStackKey = (event: TimelineEvent) =>
  event.stackLabel?.trim() ? `${event.eventType}::${event.stackLabel.trim().toLowerCase()}` : null;

/** Stacks first, then groups among everything left over, all kept in timeline order. A stack
 * needs at least two itineraries to be worth showing as one; otherwise its events fall back. */
export function buildTimelineItems(events: TimelineEvent[]): TimelineItem[] {
  const byStack = events.reduce<Record<string, TimelineEvent[]>>((acc, event) => {
    const key = getStackKey(event);
    return key ? { ...acc, [key]: [...(acc[key] ?? []), event] } : acc;
  }, {});
  const stacks = Object.entries(byStack).flatMap<EventStack>(([key, stackEvents]) => {
    const members = groupEventsByLabel(stackEvents);
    return members.length < 2
      ? []
      : [
          {
            kind: 'stack',
            key,
            label: stackEvents[0].stackLabel?.trim() ?? '',
            eventType: stackEvents[0].eventType,
            members,
            events: stackEvents,
          },
        ];
  });
  const stackedIds = new Set(stacks.flatMap((stack) => stack.events.map((event) => event.id)));
  const rest = groupEventsByLabel(events.filter((event) => !stackedIds.has(event.id)));

  const firstIndex = (item: TimelineItem) =>
    events.findIndex((event) =>
      item.kind === 'event' ? event.id === item.event.id : event.id === item.events[0].id,
    );
  const items = [...stacks, ...rest].sort((first, second) => firstIndex(first) - firstIndex(second));
  return items;
}
