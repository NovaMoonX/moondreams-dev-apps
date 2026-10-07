import DetailSheet from '@/components/DetailSheet';
import ExternalLinkText from '@/components/ExternalLinkText';
import { getDayDateLabel } from '@/utils/dateRangeUtils';
import { formatClockTime } from '@/utils/formatUtils';
import LocationLink from '@apps/waypoint/components/LocationLink';
import MapNavigationButton from '@apps/waypoint/components/MapNavigationButton';
import { RENTAL_TYPE_LABELS, STAY_TYPE_EMOJIS, STAY_TYPE_LABELS } from '@apps/waypoint/constants';
import type { Rental, Stay, TripSpace } from '@apps/waypoint/types';
import { getRentalTimezoneLabel, getStayTime, getStayTimezoneLabel } from '@apps/waypoint/utils/tripTime';

interface LogisticsDetailSheetProps {
  trip: TripSpace;
  /** What the tapped row is for; the sheet shows all of that stay's or rental's information. */
  subject: { stay: Stay } | { rental: Rental } | null;
  onClose: () => void;
}

interface Line {
  label: string;
  value: string;
}

const formatPoint = (trip: TripSpace, dayIndex: number | null, time: string | null) =>
  dayIndex === null ? null : `${getDayDateLabel(trip.startDate, dayIndex)}${time ? `, ${formatClockTime(time)}` : ''}`;

const toLines = (entries: { label: string; value: string | null }[]): Line[] =>
  entries.flatMap(({ label, value }) => (value ? [{ label, value }] : []));

function getStayLines(trip: TripSpace, stay: Stay): Line[] {
  const { checkIn, checkOut, plannedArrival, plannedDeparture } = getStayTime(trip, stay);
  return toLines([
    { label: 'Check in', value: formatPoint(trip, checkIn.dayIndex, checkIn.time) },
    { label: 'Check out', value: formatPoint(trip, checkOut.dayIndex, checkOut.time) },
    { label: 'Arriving', value: formatPoint(trip, plannedArrival.dayIndex, plannedArrival.time) },
    { label: 'Leaving', value: formatPoint(trip, plannedDeparture.dayIndex, plannedDeparture.time) },
    { label: 'Time zone', value: getStayTimezoneLabel(trip, stay, 'long') },
    { label: 'Confirmation', value: stay.confirmationCode },
  ]);
}

function getRentalLines(trip: TripSpace, rental: Rental): Line[] {
  return toLines([
    { label: 'Pick up', value: formatPoint(trip, rental.pickupDayIndex, rental.pickupTime) },
    { label: 'Return', value: formatPoint(trip, rental.returnDayIndex, rental.returnTime) },
    { label: 'Vehicle', value: rental.vehicle },
    { label: 'Time zone', value: getRentalTimezoneLabel(trip, rental, 'long') },
    { label: 'Confirmation', value: rental.confirmationCode },
  ]);
}

function LogisticsDetailSheet({ trip, subject, onClose }: LogisticsDetailSheetProps) {
  const stay = subject && 'stay' in subject ? subject.stay : null;
  const rental = subject && 'rental' in subject ? subject.rental : null;
  const title = stay ? `${STAY_TYPE_EMOJIS[stay.stayType]} ${stay.name}` : rental ? `🚘 ${rental.name}` : '';
  const kindLabel = stay ? STAY_TYPE_LABELS[stay.stayType] : rental ? RENTAL_TYPE_LABELS[rental.rentalType] : '';
  const lines = stay ? getStayLines(trip, stay) : rental ? getRentalLines(trip, rental) : [];
  const places = stay
    ? [{ label: null, name: stay.name, address: stay.address, latitude: stay.latitude, longitude: stay.longitude }]
    : rental
      ? [
          {
            label: 'Pick up at',
            name: rental.name,
            address: rental.pickupAddress,
            latitude: rental.pickupLatitude,
            longitude: rental.pickupLongitude,
          },
          ...(rental.returnAddress
            ? [
                {
                  label: 'Return to',
                  name: rental.name,
                  address: rental.returnAddress,
                  latitude: rental.returnLatitude,
                  longitude: rental.returnLongitude,
                },
              ]
            : []),
        ]
      : [];
  const linkUrl = stay?.linkUrl ?? rental?.linkUrl ?? null;
  const notes = stay?.notes ?? rental?.notes ?? null;

  return (
    <DetailSheet isOpen={subject !== null} onClose={onClose} title={title}>
      <div className='space-y-4'>
        <p className='text-muted-foreground text-sm'>{kindLabel}</p>
        {lines.length > 0 && (
          <dl className='text-muted-foreground grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm'>
            {lines.map(({ label, value }) => (
              <div key={label} className='contents'>
                <dt>{label}</dt>
                <dd className='text-foreground'>{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {places.map(({ label, name, address, latitude, longitude }) => (
          <div key={label ?? 'place'} className='space-y-1'>
            {label && <p className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>{label}</p>}
            {address ? (
              <LocationLink locationName={name} address={address} latitude={latitude} longitude={longitude} label={address} />
            ) : null}
            <MapNavigationButton locationName={name} address={address} latitude={latitude} longitude={longitude} />
          </div>
        ))}
        {linkUrl && <ExternalLinkText href={linkUrl} />}
        {notes && <p className='text-sm whitespace-pre-wrap'>{notes}</p>}
      </div>
    </DetailSheet>
  );
}

export default LogisticsDetailSheet;
