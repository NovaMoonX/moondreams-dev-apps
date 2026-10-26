import { useRef, useState } from 'react';

import { Input } from '@moondreamsdev/dreamer-ui/components';
import { Plus } from 'lucide-react';

import FilePickCard from '@/components/FilePickCard';
import RevealChip from '@/components/RevealChip';
import { getAiReadFailureMessage } from '@/lib/firebase/aiFailure';
import { extractReceiptFromFile } from '@/lib/receipts/extractReceiptFromFile';
import type { ReceiptReading } from '@/lib/receipts/receiptTypes';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const FILE_EXTENSIONS = /\.(pdf|jpe?g|png|webp|heic|heif)$/i;

type State =
  | { status: 'idle' }
  | { status: 'reading'; name: string; size: number }
  | { status: 'failed'; message: string };

interface ReceiptPhotoStepProps {
  /** What the person has in hand, in their words: "receipt" or "bill". */
  noun?: string;
  onRead: (reading: ReceiptReading) => void;
  /** The way in for a bill with no photo: the caller opens its editor empty. */
  onManual: () => void;
}

const isReadableFile = (file: File) =>
  file.type.startsWith('image/') || file.type === 'application/pdf' || FILE_EXTENSIONS.test(file.name);

/** Where a receipt photo, screenshot or PDF is chosen and read. It says what the AI does before the picker opens, and a failed or skipped reading still has the by-hand way forward. */
function ReceiptPhotoStep({ noun = 'receipt', onRead, onManual }: ReceiptPhotoStepProps) {
  const [state, setState] = useState<State>({ status: 'idle' });
  const [pickerKey, setPickerKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const isReading = state.status === 'reading';

  const fail = (message: string) => {
    setState({ status: 'failed', message });
    setPickerKey((current) => current + 1);
  };

  const handleFile = async (file: File) => {
    if (!isReadableFile(file)) {
      fail('That file type can’t be read. Try a photo, a screenshot or a PDF.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      fail(`That file is too big to read. Try a photo or a PDF under 10 MB.`);
      return;
    }
    setState({ status: 'reading', name: file.name, size: file.size });
    try {
      const reading = await extractReceiptFromFile(file);
      if (reading.lines.length === 0) {
        fail(`We couldn't find any items on that ${noun}. Try a clearer photo, or add the items yourself.`);
        return;
      }
      setPickerKey((current) => current + 1);
      onRead(reading);
    } catch (error) {
      console.error('Reading the receipt failed', error);
      fail(getAiReadFailureMessage(error, { subject: noun, fallback: 'add the items yourself' }));
    }
  };

  const getStatus = () => {
    if (state.status === 'reading') {
      return (
        <p className='text-muted-foreground text-xs' role='status'>
          Reading the {noun}…
        </p>
      );
    }
    if (state.status === 'failed') {
      return (
        <p className='text-destructive text-xs break-words' role='alert'>
          {state.message}
        </p>
      );
    }
    return (
      <p className='text-muted-foreground text-xs'>
        An AI reads the {noun} and fills in the items. You check them before anything is saved, and the photo isn&apos;t kept.
      </p>
    );
  };
  const status = getStatus();

  return (
    <div className='space-y-4'>
      <FilePickCard
        title={`Choose a photo of the ${noun}`}
        accepts='Photo, screenshot or PDF'
        limit='up to 10 MB'
        picked={state.status === 'reading' ? { name: state.name, size: state.size, emoji: '🧾' } : null}
        status={status}
        isDisabled={isReading}
        onPick={() => inputRef.current?.click()}
        onDropFile={(file) => void handleFile(file)}
      />
      <Input
        key={pickerKey}
        ref={inputRef}
        type='file'
        accept='application/pdf,image/*'
        aria-label={`Upload a photo of the ${noun}`}
        className='hidden'
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleFile(file);
          }
        }}
      />
      <div className='flex justify-center'>
        <RevealChip icon={<Plus className='h-4 w-4' />} onClick={onManual}>
          No photo? Add the items yourself
        </RevealChip>
      </div>
    </div>
  );
}

export default ReceiptPhotoStep;
