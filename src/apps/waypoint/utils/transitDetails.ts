import { TRANSIT_FIELD_SPECS, TRANSIT_TYPE_LABELS } from '@apps/waypoint/constants';
import type { TransitDetails, TransitType } from '@apps/waypoint/types';

const MINUTE_MS = 60_000;

export interface TransitDraft {
  values: Record<string, string>;
  notes: string;
  hours: string;
  minutes: string;
  customFields: { key: string; value: string }[];
}

export const EMPTY_TRANSIT_DRAFT: TransitDraft = {
  values: {},
  notes: '',
  hours: '',
  minutes: '',
  customFields: [],
};

const asText = (value: unknown) => (typeof value === 'string' ? value : '');

export function getInitialTransitDraft(
  transitType: TransitType,
  details: TransitDetails | null | undefined,
): TransitDraft {
  if (!details) {
    return EMPTY_TRANSIT_DRAFT;
  }

  const record = details as unknown as Record<string, unknown>;
  const totalMinutes = Math.round((details.estimatedTravelTimeMs ?? 0) / MINUTE_MS);
  const customFields = 'customFields' in details ? (details.customFields ?? {}) : {};
  const values = Object.fromEntries(
    TRANSIT_FIELD_SPECS[transitType].map(({ key }) => [key, asText(record[key])]),
  );

  const draft: TransitDraft = {
    values,
    notes: details.notes ?? '',
    hours: totalMinutes >= 60 ? String(Math.floor(totalMinutes / 60)) : '',
    minutes: totalMinutes > 0 ? String(totalMinutes % 60) : '',
    customFields: Object.entries(customFields).map(([key, value]) => ({ key, value })),
  };
  return draft;
}

export function buildTransitDetails(
  transitType: TransitType,
  draft: TransitDraft,
): TransitDetails {
  const totalMinutes = (Number(draft.hours) || 0) * 60 + (Number(draft.minutes) || 0);
  const customEntries = draft.customFields
    .map(({ key, value }) => [key.trim(), value.trim()] as const)
    .filter(([key, value]) => key && value);

  const fields = Object.fromEntries(
    TRANSIT_FIELD_SPECS[transitType].map(({ key }) => [key, draft.values[key]?.trim() || null]),
  );
  const iataCode = fields.airlineIataCode as string | null | undefined;
  const flightNumber = (fields.flightNumber as string | null | undefined)?.trim();
  const normalizedFields =
    transitType === 'FLIGHT' && iataCode && flightNumber && /^\d+[A-Za-z]?$/.test(flightNumber)
      ? { ...fields, flightNumber: `${iataCode} ${flightNumber}` }
      : fields;
  const details = {
    ...normalizedFields,
    notes: draft.notes.trim() || null,
    estimatedTravelTimeMs: totalMinutes > 0 ? totalMinutes * MINUTE_MS : null,
    ...(transitType === 'OTHER'
      ? { customFields: customEntries.length ? Object.fromEntries(customEntries) : null }
      : {}),
  };
  return details as unknown as TransitDetails;
}

export function formatTravelDuration(ms: number | null | undefined): string | null {
  const totalMinutes = Math.round((ms ?? 0) / MINUTE_MS);
  if (totalMinutes <= 0) {
    return null;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const result = [hours ? `${hours}h` : '', minutes ? `${minutes}m` : '']
    .filter(Boolean)
    .join(' ');
  return result;
}

export function getDerivedTravelTitle(
  transitType: TransitType,
  details: TransitDetails | null | undefined,
): string {
  const record = (details ?? {}) as unknown as Record<string, unknown>;
  const identifier = asText(record.flightNumber) || asText(record.trainNumber);
  const label = TRANSIT_TYPE_LABELS[transitType];
  const title = identifier.trim() ? `${label} ${identifier.trim()}` : label;
  return title;
}

const FLIGHT_NUMBER_PATTERN = /^([A-Z0-9]{2,3}?)(\d{1,4}[A-Z]?)$/;

/** FlightAware routes on a 3-letter ICAO airline code, so the picked airline's code wins over
 * whatever prefix the flight number was typed with. */
export function getFlightTrackingUrl(
  transitType: TransitType,
  details: TransitDetails | null | undefined,
): string | null {
  if (transitType !== 'FLIGHT' || !details || !('flightNumber' in details)) {
    return null;
  }

  const compact = (details.flightNumber ?? '').replace(/\s+/g, '').toUpperCase();
  const match = FLIGHT_NUMBER_PATTERN.exec(compact);
  const icaoCode = ('airlineIcaoCode' in details && details.airlineIcaoCode) || null;
  const flightId = icaoCode && match ? `${icaoCode}${match[2]}` : match ? compact : null;
  const url = flightId ? `https://www.flightaware.com/live/flight/${flightId}` : null;
  return url;
}

export interface TransitSummaryLine {
  label: string;
  value: string;
}

export function getTransitSummary(
  transitType: TransitType,
  details: TransitDetails | null | undefined,
  title = '',
  impliedDurationMs: number | null = null,
): TransitSummaryLine[] {
  if (!details) {
    return [];
  }

  const record = details as unknown as Record<string, unknown>;
  const pick = (label: string, key: string) => ({ label, value: asText(record[key]).trim() });
  const route = [
    asText(record.departureAirportCode) || asText(record.departureStation) || asText(record.departurePort) || asText(record.startLocation),
    asText(record.arrivalAirportCode) || asText(record.arrivalStation) || asText(record.arrivalPort) || asText(record.endLocation),
  ];
  const lines = [
    pick('Flight number', 'flightNumber'),
    pick('Train number', 'trainNumber'),
    pick('Operator', 'operator'),
    pick('Airline', 'airline'),
    pick('Vehicle', 'vehicleInfo'),
    pick('Confirmation', 'confirmationCode'),
    { label: 'Route', value: route.some(Boolean) ? route.map((part) => part || '…').join(' → ') : '' },
    { label: 'Travel time', value: formatTravelDuration(impliedDurationMs ?? details.estimatedTravelTimeMs) ?? '' },
  ].filter((line) => line.value && !title.toLowerCase().includes(line.value.toLowerCase()));

  const result = transitType === 'OTHER'
    ? [
        ...lines,
        ...Object.entries(('customFields' in details && details.customFields) || {}).map(
          ([label, value]) => ({ label, value }),
        ),
      ]
    : lines;
  return result;
}
