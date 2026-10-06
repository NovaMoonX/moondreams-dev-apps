import { useRef, useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useQueryClient } from '@tanstack/react-query';
import { AIError } from 'firebase/ai';
import { FileUp } from 'lucide-react';

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

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const toIsoDay = (epoch: number) => new Date(epoch).toISOString().slice(0, 10);

function getFailureMessage(error: unknown) {
  const status = error instanceof AIError ? error.customErrorData?.status : undefined;
  if (status === 429) {
    return 'The reader is busy right now. Give it a minute and try again, or fill it in below.';
  }
  if (error instanceof AIError && error.code === 'fetch-error' && status === undefined) {
    return `We couldn't reach the reader. Check your connection and try again, or fill it in below.`;
  }
  if (status === 403 || status === 404) {
    return `The confirmation reader isn't available right now. You can fill this in below.`;
  }
  return `We couldn't read that right now. Try a clearer photo or a PDF, or fill it in below.`;
}

/** Reads a photo, screenshot or PDF of a confirmation and fills the form around it. The person reviews and edits the fields themselves before saving. */
function UploadAutofill<T>({ kind, trip, noun, convert, onFilled }: UploadAutofillProps<T>) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<State>({ status: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);
  const [pickerKey, setPickerKey] = useState(0);

  const handleFile = async (file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      setState({ status: 'failed', message: 'That file is too big to read. Try a photo or a PDF under 10 MB.' });
      setPickerKey((current) => current + 1);
      return;
    }
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
      setPickerKey((current) => current + 1);
      setState({ status: 'done', fileName: file.name, unread: result.unread, note: result.note ?? null });
    } catch (error) {
      console.error('Reading the confirmation failed', error, error instanceof AIError ? error.customErrorData : null);
      setState({ status: 'failed', message: getFailureMessage(error) });
      setPickerKey((current) => current + 1);
    }
  };

  const isReading = state.status === 'reading';
  const buttonLabel = state.status === 'done' ? 'Replace' : 'Upload';

  return (
    <div className='border-border bg-muted/50 space-y-2 rounded-xl border p-3'>
      <div className='flex items-center gap-3'>
        <span className='bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-full'>
          <FileUp className='h-4 w-4' aria-hidden='true' />
        </span>
        <div className='min-w-0 flex-1'>
          <p className='text-sm font-medium'>Have your {noun}?</p>
          <p className='text-muted-foreground text-xs'>
            Add a photo, screenshot or PDF and an AI fills this in. It isn&apos;t saved.
          </p>
        </div>
        <Button
          type='button'
          size='sm'
          rounded='full'
          variant='secondary'
          loading={isReading}
          disabled={isReading}
          className='shrink-0'
          onClick={() => inputRef.current?.click()}
        >
          {buttonLabel}
        </Button>
        <Input
          key={pickerKey}
          ref={inputRef}
          type='file'
          accept='application/pdf,image/*'
          aria-label={`Upload your ${noun}`}
          className='hidden'
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void handleFile(file);
            }
          }}
        />
      </div>
      {state.status === 'reading' && (
        <p className='text-muted-foreground truncate text-sm' role='status'>
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
