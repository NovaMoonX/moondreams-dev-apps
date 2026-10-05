import { useState } from 'react';

import { Button, Checkbox, Input } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { useQueryClient } from '@tanstack/react-query';

import FormScreen from '@/components/FormScreen';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAppDispatch, useAppSelector } from '@/store';
import { airlinesQueryOptions } from '@/lib/airlines/airlinesQueries';
import { airportsQueryOptions } from '@/lib/airports/airportsQueries';
import { findTopPlace } from '@/lib/places/placesLookup';
import { getErrorMessage } from '@/utils/errorUtils';
import { extractBookingFromFile, type BookingKind } from '@apps/waypoint/lib/extractBookingFromFile';
import { createEvent, type EventFields } from '@apps/waypoint/store/actions/eventActions';
import { createRental } from '@apps/waypoint/store/actions/rentalActions';
import { createStay } from '@apps/waypoint/store/actions/stayActions';
import { selectSortedTimelineEvents } from '@apps/waypoint/store/selectors';
import type { TripSpace } from '@apps/waypoint/types';
import { normalizeLabel } from '@apps/waypoint/utils/eventGroups';
import { proposeBooking, type ProposedBooking, type ProposedEntry } from '@apps/waypoint/utils/bookingImport';

/** Keeps the "reading" state up long enough to be read rather than flash by. */
const MIN_READING_MS = 1500;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const COPY: Record<BookingKind, { title: string; intro: string; emoji: string; noun: string }> = {
  travel: {
    title: 'Travel booking',
    intro: 'Drop in a ticket, itinerary or screenshot and we will turn it into your travel, ready to review.',
    emoji: '✈️',
    noun: 'flight, train or ferry',
  },
  stays: {
    title: 'Stay booking',
    intro: 'Drop in a hotel or rental confirmation and we will fill in the stay for you to review.',
    emoji: '🛏️',
    noun: 'stay',
  },
  rentals: {
    title: 'Rental booking',
    intro: 'Drop in a car rental confirmation and we will fill in the pickup and return for you to review.',
    emoji: '🚗',
    noun: 'car rental',
  },
};

type Step = 'pick' | 'reading' | 'review';

interface BookingImportModalProps {
  isOpen: boolean;
  trip: TripSpace;
  currentUserId: string;
  kind: BookingKind;
  onClose: () => void;
}

interface ReviewRow {
  key: string;
  section: BookingKind;
  index: number;
  entry: ProposedEntry<unknown>;
}

function getRows(proposal: ProposedBooking): ReviewRow[] {
  const toRows = (section: BookingKind, entries: ProposedEntry<unknown>[]) =>
    entries.map((entry, index) => ({ key: `${section}-${index}`, section, index, entry }));
  return [
    ...toRows('travel', proposal.travel),
    ...toRows('stays', proposal.stays),
    ...toRows('rentals', proposal.rentals),
  ];
}

function BookingImportModal({ isOpen, trip, currentUserId, kind, onClose }: BookingImportModalProps) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const events = useAppSelector(selectSortedTimelineEvents);
  const [step, setStep] = useState<Step>('pick');
  const [file, setFile] = useState<File | null>(null);
  const [proposal, setProposal] = useState<ProposedBooking | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const copy = COPY[kind];

  const handleRead = async () => {
    if (!file) {
      return;
    }

    setError(null);
    setStep('reading');
    try {
      const [extracted, airports, airlines] = await Promise.all([
        extractBookingFromFile(file, kind, new Date(trip.startDate).getUTCFullYear()),
        queryClient.fetchQuery(airportsQueryOptions()).catch(() => []),
        queryClient.fetchQuery(airlinesQueryOptions()).catch(() => []),
        delay(MIN_READING_MS),
      ]);
      const proposed = proposeBooking(trip, currentUserId, extracted, airports, airlines);
      setProposal(proposed);
      setSelected(getRows(proposed).filter((row) => !row.entry.isOutsideTrip).map((row) => row.key));
      setStep('review');
    } catch (readError) {
      setError(getErrorMessage(readError, 'We could not read that file. Try a clearer photo or a PDF.'));
      setStep('pick');
    }
  };

  const getGroupLabel = (entries: ProposedEntry<EventFields>[]) => {
    const last = entries.at(-1)?.fields.eventDetails;
    const arrival =
      last && 'transitDetails' in last && last.transitDetails && 'arrivalAirportCode' in last.transitDetails
        ? last.transitDetails.arrivalAirportCode
        : null;
    const base = arrival ? `Flights to ${arrival}` : 'Flight legs';
    const taken = events.map((event) => normalizeLabel(event.groupLabel ?? ''));
    const pick = (attempt: number): string => {
      const candidate = attempt === 1 ? base : `${base} (${attempt})`;
      return taken.includes(normalizeLabel(candidate)) ? pick(attempt + 1) : candidate;
    };
    return pick(1);
  };

  const handleSave = async () => {
    if (!proposal) {
      return;
    }

    const rows = getRows(proposal).filter((row) => selected.includes(row.key));
    const travel = rows.filter((row) => row.section === 'travel').map((row) => proposal.travel[row.index]);
    const groupLabel = travel.length > 1 && travel.every((entry) => entry.fields.eventDetails && 'transitType' in entry.fields.eventDetails && entry.fields.eventDetails.transitType === 'FLIGHT')
      ? getGroupLabel(travel)
      : null;

    setIsSaving(true);
    setError(null);
    try {
      await Promise.all(
        travel.map(async (entry) => {
          const airport = entry.airports?.departure;
          const place = airport
            ? await findTopPlace(queryClient, `${airport.name} ${airport.iataCode}`, airport, ['airport']).catch(() => null)
            : null;
          await dispatch(
            createEvent({
              uid: currentUserId,
              trip,
              event: {
                ...entry.fields,
                groupLabel,
                ...(place
                  ? {
                      locationName: place.name,
                      address: place.address || null,
                      latitude: place.latitude,
                      longitude: place.longitude,
                      place: place.place,
                    }
                  : {}),
              },
            }),
          ).unwrap();
        }),
      );
      await Promise.all(
        rows
          .filter((row) => row.section === 'stays')
          .map(async (row) => {
            const fields = proposal.stays[row.index].fields;
            const place = await findTopPlace(queryClient, `${fields.name} ${fields.address}`).catch(() => null);
            await dispatch(
              createStay({
                uid: currentUserId,
                trip,
                stay: place
                  ? { ...fields, address: place.address || fields.address, latitude: place.latitude, longitude: place.longitude, place: place.place }
                  : fields,
              }),
            ).unwrap();
          }),
      );
      await Promise.all(
        rows
          .filter((row) => row.section === 'rentals')
          .map(async (row) => {
            const fields = proposal.rentals[row.index].fields;
            const place = await findTopPlace(queryClient, `${fields.name} ${fields.pickupAddress}`).catch(() => null);
            await dispatch(
              createRental({
                uid: currentUserId,
                trip,
                rental: place
                  ? {
                      ...fields,
                      pickupAddress: place.address || fields.pickupAddress,
                      pickupLatitude: place.latitude,
                      pickupLongitude: place.longitude,
                      pickupPlace: place.place,
                    }
                  : fields,
              }),
            ).unwrap();
          }),
      );
      addToast({
        title: rows.length === 1 ? 'Added to your trip' : `${rows.length} entries added to your trip`,
        type: 'success',
      });
      onClose();
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save these entries.'));
    } finally {
      setIsSaving(false);
    }
  };

  if (step === 'reading') {
    return (
      <FormScreen isOpen={isOpen} onClose={onClose} title={copy.title}>
        <div className='flex flex-col items-center gap-4 py-10 text-center'>
          <span className='text-4xl' aria-hidden>
            {copy.emoji}
          </span>
          <div className='border-primary/20 border-t-primary h-10 w-10 animate-spin rounded-full border-4' />
          <p className='text-muted-foreground'>Reading your booking…</p>
        </div>
      </FormScreen>
    );
  }

  if (step === 'review' && proposal) {
    const rows = getRows(proposal);
    return (
      <FormScreen isOpen={isOpen} onClose={onClose} title={copy.title}>
        <div className='space-y-4'>
          {rows.length === 0 ? (
            <p className='text-muted-foreground text-sm'>
              We couldn&apos;t find a {copy.noun} with dates in that file. Try a clearer photo, or add it by hand.
            </p>
          ) : (
            <>
              <p className='text-muted-foreground text-sm'>
                Here&apos;s what we found. Untick anything that isn&apos;t right; you can edit it after it&apos;s added.
              </p>
              <ul className='divide-border divide-y'>
                {rows.map((row) => (
                  <li key={row.key} className='py-2.5'>
                    <label className='flex cursor-pointer items-start gap-3'>
                      <Checkbox
                        className='mt-1'
                        checked={selected.includes(row.key)}
                        onCheckedChange={(checked) =>
                          setSelected((current) =>
                            checked === true ? [...current, row.key] : current.filter((key) => key !== row.key),
                          )
                        }
                      />
                      <span className='w-5 shrink-0 text-center' aria-hidden>
                        {row.entry.emoji}
                      </span>
                      <span className='min-w-0 flex-1'>
                        <span className='block font-medium'>{row.entry.title}</span>
                        <span className='text-muted-foreground block text-sm'>{row.entry.when}</span>
                        {row.entry.isOutsideTrip && (
                          <span className='text-warning block text-xs'>
                            More than 3 days outside your trip dates, so it&apos;s unticked.
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
          {proposal.skippedCount > 0 && (
            <p className='text-muted-foreground text-xs'>
              {proposal.skippedCount === 1 ? 'One entry' : `${proposal.skippedCount} entries`} didn&apos;t have a clear
              date or time, so you&apos;ll want to add {proposal.skippedCount === 1 ? 'it' : 'them'} by hand.
            </p>
          )}
          {error && <p className='text-destructive text-sm'>{error}</p>}
          <ModalFooterActions
            rightActions={
              <>
                <Button
                  type='button'
                  variant='secondary'
                  disabled={isSaving}
                  onClick={rows.length === 0 ? () => setStep('pick') : onClose}
                >
                  {rows.length === 0 ? 'Back' : 'Cancel'}
                </Button>
                {rows.length > 0 && (
                  <Button
                    type='button'
                    loading={isSaving}
                    disabled={isSaving || selected.length === 0}
                    onClick={() => void handleSave()}
                  >
                    {isSaving ? 'Adding…' : selected.length > 1 ? `Add ${selected.length}` : 'Add'}
                  </Button>
                )}
              </>
            }
          />
        </div>
      </FormScreen>
    );
  }

  return (
    <FormScreen isOpen={isOpen} onClose={onClose} title={copy.title}>
      <div className='space-y-4'>
        <p className='text-muted-foreground text-sm'>{copy.intro}</p>
        <Input
          type='file'
          accept='application/pdf,image/*'
          aria-label='Booking file'
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setError(null);
          }}
        />
        {file && <p className='text-muted-foreground text-sm'>{file.name}</p>}
        <p className='text-muted-foreground text-xs'>
          Photos and PDFs are read to fill in the details and are not kept. You review everything before it&apos;s added.
        </p>
        {error && <p className='text-destructive text-sm'>{error}</p>}
        <ModalFooterActions
          rightActions={
            <>
              <Button type='button' variant='secondary' onClick={onClose}>
                Cancel
              </Button>
              <Button type='button' disabled={!file} onClick={() => void handleRead()}>
                Read it
              </Button>
            </>
          }
        />
      </div>
    </FormScreen>
  );
}

export default BookingImportModal;
