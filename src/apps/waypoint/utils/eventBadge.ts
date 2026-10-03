import {
  EVENT_TYPE_BADGE_CLASSES,
  EVENT_TYPE_EMOJIS,
  EVENT_TYPE_LABELS,
  TRANSIT_TYPE_BADGE_CLASSES,
  TRANSIT_TYPE_EMOJIS,
  TRANSIT_TYPE_LABELS,
} from '@apps/waypoint/constants';
import type { TimelineEvent } from '@apps/waypoint/types';

export interface EventBadge {
  emoji: string;
  label: string;
  className: string;
}

type BadgeSource = Pick<TimelineEvent, 'eventType' | 'eventDetails'>;

/** How an event announces its kind: a travel event shows its transit type (and color)
 * rather than the generic travel badge. */
export function getEventBadge({ eventType, eventDetails }: BadgeSource): EventBadge {
  if (eventType === 'TRAVEL' && eventDetails && 'transitType' in eventDetails) {
    const { transitType } = eventDetails;
    if (TRANSIT_TYPE_LABELS[transitType]) {
      return {
        emoji: TRANSIT_TYPE_EMOJIS[transitType],
        label: TRANSIT_TYPE_LABELS[transitType],
        className: TRANSIT_TYPE_BADGE_CLASSES[transitType],
      };
    }
  }
  return {
    emoji: EVENT_TYPE_EMOJIS[eventType],
    label: EVENT_TYPE_LABELS[eventType],
    className: EVENT_TYPE_BADGE_CLASSES[eventType],
  };
}

/** A group's badge: its members' shared kind, or the plain event type when they differ. */
export function getGroupBadge(events: BadgeSource[]): EventBadge {
  const badges = events.map(getEventBadge);
  const [first] = badges;
  return badges.every((badge) => badge.label === first.label)
    ? first
    : getEventBadge({ eventType: events[0].eventType, eventDetails: null });
}
