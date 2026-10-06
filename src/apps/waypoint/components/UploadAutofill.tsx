import { useState } from 'react';

import { Input } from '@moondreamsdev/dreamer-ui/components';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

import { airlinesQueryOptions, type AirlineOption } from '@/lib/airlines/airlinesQueries';
import { airportsQueryOptions, type AirportOption } from '@/lib/airports/airportsQueries';
import {
  extractBookingFromFile,
  type BookingKind,
  type ExtractedBooking,
} from '@apps/waypoint/lib/extractBookingFromFile';
import type { TripSpace } from '@apps/waypoint/types';
import type { Autofill } from '@apps/waypoint/utils/bookingImport';

interface Lookups {
  airports: AirportOption[];
  airlines: AirlineOption[];
}

interface UploadAutofillProps<T> {
  kind: BookingKind;
  trip: TripSpace;
  /** What the person is holding, in their words: "flight confirmation". */
  noun: string;
  convert: (extracted: ExtractedBooking, lookups: Lookups) => (Autofill<T> & { note?: string }) | null;
  onFilled: (result: Autofill<T>) => void;
}

type State =
  | { status: 'idle' }
  | { status: 'reading'; fileName: string }
  | { status: 'done'; fileName: string; unread: string[]; note: string | null }
  | { status: 'failed'; message: string };

const toIsoDay = (epoch: number) => new Date(epoch).toISOString().slice(0, 10);

/** Reads a photo, screenshot or PDF of a confirmation and fills the form around it. The person reviews and edits the fields themselves before saving. */
function UploadAutofill<T>({ kind, trip, noun, convert, onFilled }: UploadAutofillProps<T>) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<State>({ status: 'idle' });
  const [pickerKey, setPickerKey] = useState(0);

  const handleFile = async (file: File) => {
    setState({ status: 'reading', fileName: file.name });
    try {
      const [extracted, airports, airlines] = await Promise.all([
        extractBookingFromFile(file, kind, { startDate: toIsoDay(trip.startDate), endDate: toIsoDay(trip.endDate) }),
        queryClient.fetchQuery(airportsQueryOptions()).catch(() => []),
        queryClient.fetchQuery(airlinesQueryOptions()).catch(() => []),
      ]);
      const result = convert(extracted, { airports, airlines });
      if (!result) {
        setState({ status: 'failed', message: `We couldn't find a ${noun} in that file. Try a clearer photo or a PDF.` });
        setPickerKey((current) => current + 1);
        return;
      }
      onFilled(result);
      setState({ status: 'done', fileName: file.name, unread: result.unread, note: result.note ?? null });
    } catch (error) {
      console.error('Reading the confirmation failed', error);
      setState({ status: 'failed', message: `We couldn't read that right now. Try a clearer photo or a PDF, or fill it in below.` });
      setPickerKey((current) => current + 1);
    }
  };

  return (
    <div className='border-border bg-muted/50 space-y-2 rounded-xl border p-3'>
      <div>
        <p className='text-sm font-medium'>Have your {noun}?</p>
        <p className='text-muted-foreground text-xs'>
          Upload a photo, screenshot or PDF and we&apos;ll fill this in. You can change anything before you save.
        </p>
        <p className='text-muted-foreground text-xs'>An AI model reads the file to fill the form. It isn&apos;t saved.</p>
      </div>
      {state.status !== 'reading' && (
        <Input
          key={pickerKey}
          type='file'
          accept='application/pdf,image/*'
          aria-label={`Upload your ${noun}`}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void handleFile(file);
            }
          }}
        />
      )}
      {state.status === 'reading' && (
        <p className='text-muted-foreground flex items-center gap-2 text-sm' role='status'>
          <Loader2 className='h-4 w-4 animate-spin' />
          Reading {state.fileName}…
        </p>
      )}
      {state.status === 'done' && (
        <div className='space-y-0.5 text-sm' role='status'>
          <p>Filled in from {state.fileName}. Take a look before you save.</p>
          {state.note && <p className='text-muted-foreground text-xs'>{state.note}</p>}
          {state.unread.length > 0 && (
            <p className='text-warning text-xs'>We couldn&apos;t read: {state.unread.join(', ')}. Add those below.</p>
          )}
        </div>
      )}
      {state.status === 'failed' && <p className='text-destructive text-sm break-words'>{state.message}</p>}
    </div>
  );
}

export default UploadAutofill;
