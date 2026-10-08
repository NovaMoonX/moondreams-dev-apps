import { STAY_TYPE_EMOJIS } from '@apps/waypoint/constants';
import type { Rental, Stay, TripSpace } from '@apps/waypoint/types';
import { getStayTime } from '@apps/waypoint/utils/tripTime';

export interface LogisticsEntry {
  key: string;
  subject: { kind: 'STAY' | 'RENTAL'; id: string };
  dayIndex: number;
  /** `HH:mm`; `null` when the day is known but not the time, which sits at the top of the day. */
  time: string | null;
  emoji: string;
  verb: string;
  name: string;
}

interface DayPoint {
  dayIndex: number | null;
  time: string | null;
}

const isSamePoint = (first: DayPoint, second: DayPoint) =>
  first.dayIndex === second.dayIndex && first.time === second.time;

function pickStayPoint(planned: DayPoint, official: DayPoint, plannedVerb: string, officialVerb: string) {
  const isPlanned = planned.time !== null && !isSamePoint(planned, official);
  if (isPlanned) {
    return { point: planned, verb: plannedVerb };
  }
  if (official.time !== null || planned.dayIndex === null) {
    return { point: official, verb: officialVerb };
  }
  return { point: planned, verb: officialVerb };
}

export function getLogisticsEntries(trip: TripSpace, stays: Stay[], rentals: Rental[]): LogisticsEntry[] {
  const stayEntries = stays.flatMap((stay) => {
    const { checkIn, checkOut, plannedArrival, plannedDeparture } = getStayTime(trip, stay);
    return [
      { id: 'in', ...pickStayPoint(plannedArrival, checkIn, 'Arrive', 'Check in') },
      { id: 'out', ...pickStayPoint(plannedDeparture, checkOut, 'Leave', 'Check out') },
    ].flatMap(({ id, point, verb }) =>
      point.dayIndex === null
        ? []
        : [{ key: `stay-${stay.id}-${id}`, subject: { kind: 'STAY' as const, id: stay.id }, dayIndex: point.dayIndex, time: point.time, emoji: STAY_TYPE_EMOJIS[stay.stayType] ?? STAY_TYPE_EMOJIS.OTHER, verb, name: stay.name }],
    );
  });

  const rentalEntries = rentals.flatMap((rental) => [
    {
      key: `rental-${rental.id}-pickup`,
      subject: { kind: 'RENTAL' as const, id: rental.id },
      dayIndex: rental.pickupDayIndex,
      time: rental.pickupTime || null,
      emoji: '🚘',
      verb: 'Pick up',
      name: rental.name,
    },
    {
      key: `rental-${rental.id}-return`,
      subject: { kind: 'RENTAL' as const, id: rental.id },
      dayIndex: rental.returnDayIndex,
      time: rental.returnTime || null,
      emoji: '🚗',
      verb: 'Return',
      name: rental.name,
    },
  ]);

  return [...stayEntries, ...rentalEntries];
}

export const toMinutes = (time: string | null) => {
  if (!time) {
    return null;
  }
  const [hours, minutes] = time.split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
};
