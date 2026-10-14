import { useRef, useState, type DragEvent } from 'react';

import { Button, Input, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useQueryClient } from '@tanstack/react-query';
import { AIError } from 'firebase/ai';
import { FirebaseError } from 'firebase/app';

import { MAX_PASTE_CHARS, MAX_UPLOAD_BYTES } from '@apps/pinch/constants';
import {
  extractRecipeFromFile,
  extractRecipeFromPage,
  extractRecipeFromText,
  type ExtractedRecipe,
} from '@apps/pinch/lib/extractRecipe';
import { recipePageQueryOptions } from '@apps/pinch/queries/recipePageQueries';
import type { RecipeSource, RecipeStartMethod } from '@apps/pinch/types';

const asWebLink = (text: string) => {
  const trimmed = text.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    return ['http:', 'https:'].includes(url.protocol) &&
      url.hostname.includes('.')
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};

const getFailureMessage = (error: unknown, source: RecipeSource) => {
  if (error instanceof FirebaseError && error.code.startsWith('functions/')) {
    return "We couldn't open that link. Check the address, or paste the recipe's text instead.";
  }

  const status =
    error instanceof AIError ? error.customErrorData?.status : undefined;
  if (status === 429) {
    return 'The reader is busy right now. Give it a minute and try again, or write it yourself below.';
  }
  if (
    error instanceof AIError &&
    error.code === 'fetch-error' &&
    status === undefined
  ) {
    return "We couldn't reach the reader. Check your connection and try again, or write it yourself below.";
  }
  if (status === 403 || status === 404) {
    return "The recipe reader isn't available right now. You can write it yourself below.";
  }
  if (source === 'AI_LINK') {
    return "We couldn't read a recipe from that page. Paste its text instead, or write it yourself below.";
  }
  if (source === 'AI_TEXT') {
    return "We couldn't read that text right now. Try again, or write it yourself below.";
  }
  return "We couldn't read that right now. Try a clearer photo or a PDF, or write it yourself below.";
};

type State =
  | { status: 'idle' }
  | { status: 'reading'; label: string }
  | { status: 'failed'; message: string };

interface RecipeReaderProps {
  method: Exclude<RecipeStartMethod, 'manual'>;
  /** Called with what the reader found; the form fills what was read and the person reviews it before saving. */
  onRead: (
    recipe: ExtractedRecipe,
    source: RecipeSource,
    label: string,
  ) => void;
  onManual: () => void;
}

/** One way of starting a recipe, finished on its own screen: say what the AI will do, take the text, link or file, and read it. */
function RecipeReader({ method, onRead, onManual }: RecipeReaderProps) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<State>({ status: 'idle' });
  const [text, setText] = useState('');
  const [link, setLink] = useState('');
  const [fileKey, setFileKey] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
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

      onRead(extracted, source, label);
    } catch (error) {
      console.error(
        'Reading the recipe failed',
        error,
        error instanceof AIError ? error.customErrorData : null,
      );
      setState({ status: 'failed', message: getFailureMessage(error, source) });
    } finally {
      setFileKey((current) => current + 1);
    }
  };

  const handleFile = (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      setState({
        status: 'failed',
        message:
          'That file is too big to read. Try a photo or a PDF under 10 MB.',
      });
      setFileKey((current) => current + 1);
      return;
    }

    void run(file.name, 'AI_FILE', () => extractRecipeFromFile(file));
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (!file || isReading) {
      return;
    }
    if (file.type !== 'application/pdf' && !file.type.startsWith('image/')) {
      setState({
        status: 'failed',
        message:
          "That isn't a photo, screenshot or PDF. Try one of those, or write it yourself below.",
      });
      return;
    }

    handleFile(file);
  };

  const handleLink = () => {
    const url = asWebLink(link);
    if (url === null) {
      setState({
        status: 'failed',
        message: "That doesn't look like a web link. Check it and try again.",
      });
      return;
    }

    void run(new URL(url).hostname, 'AI_LINK', async () =>
      extractRecipeFromPage(
        await queryClient.fetchQuery(recipePageQueryOptions(url)),
      ),
    );
  };

  const getView = () => {
    if (method === 'text') {
      return (
        <>
          <p className='text-muted-foreground text-sm'>
            An AI reads it and fills in the form. It isn’t saved.
          </p>
          <Textarea
            rows={10}
            variant='outline'
            aria-label='Paste a recipe'
            placeholder='Paste the recipe here: the title, ingredients and steps'
            maxLength={MAX_PASTE_CHARS}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <Button
            type='button'
            className='w-full sm:w-auto sm:self-start'
            loading={isReading}
            disabled={isReading || text.trim() === ''}
            onClick={() =>
              void run('your text', 'AI_TEXT', () =>
                extractRecipeFromText(text),
              )
            }
          >
            Fill in the recipe
          </Button>
        </>
      );
    }

    if (method === 'link') {
      return (
        <>
          <p className='text-muted-foreground text-sm'>
            We open the page and an AI reads the recipe from it.
          </p>
          <Input
            type='url'
            inputMode='url'
            variant='outline'
            aria-label='Recipe link'
            placeholder='https://…'
            value={link}
            onChange={(event) => setLink(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && link.trim() !== '' && !isReading) {
                event.preventDefault();
                handleLink();
              }
            }}
          />
          <Button
            type='button'
            className='w-full sm:w-auto sm:self-start'
            loading={isReading}
            disabled={isReading || link.trim() === ''}
            onClick={handleLink}
          >
            Fill in the recipe
          </Button>
        </>
      );
    }

    return (
      <>
        <p className='text-muted-foreground text-sm'>
          An AI reads the file and fills in the form. It isn’t saved.
        </p>
        <div
          className={join(
            'flex flex-col items-center gap-3 rounded-2xl border border-dashed px-4 py-8 text-center',
            isDragging
              ? 'bg-accent/40 border-[var(--pinch-drizzle)]'
              : 'border-border',
          )}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) {
              setIsDragging(false);
            }
          }}
          onDrop={handleDrop}
        >
          <span
            className='bg-accent grid size-12 place-items-center rounded-xl text-2xl'
            aria-hidden='true'
          >
            📎
          </span>
          <p className='text-sm'>
            A photo, screenshot or PDF,{' '}
            <span className='whitespace-nowrap'>up to 10 MB.</span>
          </p>
          <Button
            type='button'
            loading={isReading}
            disabled={isReading}
            onClick={() => fileRef.current?.click()}
          >
            Choose a file
          </Button>
          <p className='text-muted-foreground text-xs max-sm:hidden'>
            or drop it here
          </p>
        </div>
        <Input
          key={fileKey}
          ref={fileRef}
          type='file'
          accept='application/pdf,image/*'
          aria-label='Upload a recipe'
          className='hidden'
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </>
    );
  };

  return (
    <div className='space-y-4'>
      {getView()}
      {state.status === 'reading' && (
        <p className='text-muted-foreground truncate text-sm' role='status'>
          Reading {state.label}…
        </p>
      )}
      {state.status === 'failed' && (
        <p className='text-destructive text-sm break-words'>{state.message}</p>
      )}
      <Button
        type='button'
        variant='link'
        className='h-10 justify-start px-0!'
        disabled={isReading}
        onClick={onManual}
      >
        Write it yourself instead
      </Button>
    </div>
  );
}

export default RecipeReader;
