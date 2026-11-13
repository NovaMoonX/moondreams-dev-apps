import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { PART_OF_WORDS } from '@apps/runway/constants';
import type { EventLink } from '@apps/runway/store/actions/itemActions';
import type { ResolvedHorizon } from '@apps/runway/store/selectors/runwaySelectors';
import type { DateOnly } from '@apps/runway/types';

/**
 * What a write needs to make an item's change part of an event: the event as `events` holds it now and the log line it gets. Null when no event is picked; throws the "no longer open" sentence when the picked one is gone, so a save's own error line shows it. `events` is read at the tap (`selectAllHorizonItems(store.getState(), today)`), never a render's copy.
 */
export function getEventLink(
  events: readonly ResolvedHorizon[],
  eventId: string | null,
  made: { today: DateOnly; itemName: string; what: string; from: DateOnly },
): EventLink | null {
  if (eventId === null) return null;
  const event = events.find(({ item }) => item.id === eventId);
  if (event?.version.payload.state !== 'open')
    throw new Error(PART_OF_WORDS.eventGone);
  return {
    eventId,
    horizon: event.version.payload,
    baseVersionId: event.version.id,
    on: made.today,
    summary: PART_OF_WORDS.linkedLine(
      made.itemName,
      made.what,
      formatDateOrdinalUTC(made.from),
      event.version.payload.name,
    ),
  };
}
