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
