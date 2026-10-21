import { useRef, useState } from 'react';

import { Button, Input, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { AIError } from 'firebase/ai';

import {
  extractRecipeFromFile,
  extractRecipeFromText,
  type ExtractedRecipe,
} from '@apps/pinch/lib/extractRecipe';
import { MAX_PASTE_CHARS, MAX_UPLOAD_BYTES } from '@apps/pinch/constants';
import type { RecipeSource } from '@apps/pinch/types';

type State =
  | { status: 'idle' }
  | { status: 'reading'; label: string }
  | { status: 'done'; label: string; unread: string[] }
  | { status: 'failed'; message: string };

function getFailureMessage(error: unknown) {
  const status =
    error instanceof AIError ? error.customErrorData?.status : undefined;
  if (status === 429) {
    return 'The reader is busy right now. Give it a minute and try again, or fill it in below.';
  }
  if (
    error instanceof AIError &&
    error.code === 'fetch-error' &&
    status === undefined
  ) {
    return "We couldn't reach the reader. Check your connection and try again, or fill it in below.";
  }
  if (status === 403 || status === 404) {
    return "The recipe reader isn't available right now. You can fill this in below.";
  }
  return "We couldn't read that right now. Try a clearer photo or a PDF, or fill it in below.";
}

interface RecipeAutofillProps {
  /** Called with what the reader found; the form fills only what was read and the person reviews it before saving. */
  onFilled: (recipe: ExtractedRecipe, source: RecipeSource) => void;
}

/** Two quiet rows above the recipe form: read a photo, screenshot or PDF, or read pasted text. Nothing is saved from either. */
function RecipeAutofill({ onFilled }: RecipeAutofillProps) {
  const [state, setState] = useState<State>({ status: 'idle' });
  const [isPasting, setIsPasting] = useState(false);
  const [text, setText] = useState('');
  const [pickerKey, setPickerKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const isReading = state.status === 'reading';

  const run = async (
    label: string,
    source: RecipeSource,
    read: () => Promise<ExtractedRecipe>,
  ) => {
    setState({ status: 'reading', label });
    try {
      const extracted = await read();
      if (extracted.ingredients.length === 0) {
        setState({
          status: 'failed',
          message:
            "We couldn't find a recipe in that. Try a clearer photo or paste the text.",
        });
        return;
      }

      onFilled(extracted, source);
      setIsPasting(false);
      setText('');
      setState({ status: 'done', label, unread: extracted.unread });
    } catch (error) {
      console.error(
        'Reading the recipe failed',
        error,
        error instanceof AIError ? error.customErrorData : null,
      );
      setState({ status: 'failed', message: getFailureMessage(error) });
    } finally {
      setPickerKey((current) => current + 1);
    }
  };

  const handleFile = (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      setState({
        status: 'failed',
        message:
          'That file is too big to read. Try a photo or a PDF under 10 MB.',
      });
      setPickerKey((current) => current + 1);
      return;
    }

    void run(file.name, 'AI_FILE', () => extractRecipeFromFile(file));
  };

  return (
    <div className='border-border mb-4 space-y-3 rounded-2xl border p-3'>
      <div className='flex items-center gap-3'>
        <span className='w-6 shrink-0 text-center text-lg' aria-hidden='true'>
          📷
        </span>
        <div className='min-w-0 flex-1'>
          <p className='text-sm font-medium'>
            Have a recipe on paper or a screenshot?
          </p>
          <p className='text-muted-foreground text-xs'>
            An AI reads it and fills in the form. It isn’t saved.
          </p>
        </div>
        <Button
          type='button'
          size='sm'
          rounded='full'
          variant='secondary'
          disabled={isReading}
          onClick={() => inputRef.current?.click()}
        >
          Upload
        </Button>
        <Input
          key={pickerKey}
          ref={inputRef}
          type='file'
          accept='application/pdf,image/*'
          aria-label='Upload a recipe'
          className='hidden'
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>
      <div className='flex items-center gap-3'>
        <span className='w-6 shrink-0 text-center text-lg' aria-hidden='true'>
          📝
        </span>
        <p className='min-w-0 flex-1 text-sm font-medium'>
          Copied one from a chat?
        </p>
        <Button
          type='button'
          size='sm'
          rounded='full'
          variant='secondary'
          disabled={isReading}
          onClick={() => setIsPasting((current) => !current)}
        >
          {isPasting ? 'Close' : 'Paste'}
        </Button>
      </div>
      {isPasting && (
        <div className='space-y-2'>
          <Textarea
            rows={5}
            variant='outline'
            aria-label='Paste a recipe'
            placeholder='Paste the recipe here'
            maxLength={MAX_PASTE_CHARS}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <div className='flex items-center justify-between gap-3'>
            <span className='text-muted-foreground text-xs'>
              {text.length >= MAX_PASTE_CHARS * 0.9
                ? `${text.length.toLocaleString()} / ${MAX_PASTE_CHARS.toLocaleString()}`
                : ''}
            </span>
            <Button
              type='button'
              size='sm'
              rounded='full'
              className='shrink-0 whitespace-nowrap'
              loading={isReading}
              disabled={isReading || text.trim() === ''}
              onClick={() =>
                void run('your text', 'AI_TEXT', () =>
                  extractRecipeFromText(text),
                )
              }
            >
              Read it
            </Button>
          </div>
        </div>
      )}
      {state.status === 'reading' && (
        <p className='text-muted-foreground truncate text-sm' role='status'>
          Reading {state.label}…
        </p>
      )}
      {state.status === 'done' && (
        <div className='space-y-0.5 text-sm' role='status'>
          <p>Filled in from {state.label}. Take a look before you save.</p>
          {state.unread.length > 0 && (
            <p className='text-muted-foreground text-xs'>
              We couldn&apos;t read: {state.unread.join(', ')}.
            </p>
          )}
        </div>
      )}
      {state.status === 'failed' && (
        <p className='text-destructive text-sm break-words'>{state.message}</p>
      )}
    </div>
  );
}

export default RecipeAutofill;
