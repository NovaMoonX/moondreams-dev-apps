import { useRef, useState } from 'react';

import { Button, Input, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { useQueryClient } from '@tanstack/react-query';
import { AIError } from 'firebase/ai';
import { FirebaseError } from 'firebase/app';

import MethodPicker from '@/components/MethodPicker';
import { pageContentQueryOptions } from '@/lib/pageContent/pageContentQueries';
import { MAX_PASTE_CHARS, MAX_UPLOAD_BYTES } from '@apps/pinch/constants';
import {
  extractRecipeFromFile,
  extractRecipeFromPage,
  extractRecipeFromText,
  type ExtractedRecipe,
} from '@apps/pinch/lib/extractRecipe';
import type { RecipeSource } from '@apps/pinch/types';

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

const getFailureMessage = (error: unknown) => {
  if (error instanceof FirebaseError && error.code.startsWith('functions/')) {
    if (error.code === 'functions/invalid-argument') {
      return "That doesn't look like a web link. Check it and try again.";
    }
    if (error.code === 'functions/failed-precondition') {
      return "That link isn't a page we can read. Paste the recipe's text instead.";
    }
    return "We couldn't open that link. Try again, or paste the recipe's text instead.";
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
  return "We couldn't read that right now. Try a clearer photo or a PDF, or write it yourself below.";
};

type State =
  | { status: 'idle' }
  | { status: 'reading'; label: string }
  | { status: 'failed'; message: string };

interface RecipeStartProps {
  /** Called with what the reader found; the form fills what was read and the person reviews it before saving. */
  onRead: (
    recipe: ExtractedRecipe,
    source: RecipeSource,
    label: string,
  ) => void;
  onManual: () => void;
}

/** How a new recipe begins: from pasted text, a photo, a link, or by hand. Nothing is saved until the person has reviewed the form. */
function RecipeStart({ onRead, onManual }: RecipeStartProps) {
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [state, setState] = useState<State>({ status: 'idle' });
  const [text, setText] = useState('');
  const [link, setLink] = useState('');
  const [pickerKey, setPickerKey] = useState(0);
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
        await queryClient.fetchQuery(pageContentQueryOptions(url)),
      ),
    );
  };

  const handleOpenChange = (id: string | null) => {
    setState({ status: 'idle' });
    setOpenId(id);
  };

  const textPanel = (
    <div className='space-y-2'>
      <Textarea
        rows={6}
        variant='outline'
        aria-label='Paste a recipe'
        placeholder='Paste the recipe here: the title, ingredients and steps'
        maxLength={MAX_PASTE_CHARS}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className='flex items-center justify-between gap-3'>
        <span className='text-muted-foreground text-xs'>
          An AI reads it and fills in the form. It isn’t saved.
        </span>
        <Button
          type='button'
          size='sm'
          rounded='full'
          className='shrink-0 whitespace-nowrap'
          loading={isReading}
          disabled={isReading || text.trim() === ''}
          onClick={() =>
            void run('your text', 'AI_TEXT', () => extractRecipeFromText(text))
          }
        >
          Read it
        </Button>
      </div>
    </div>
  );

  const linkPanel = (
    <div className='space-y-2'>
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
      <div className='flex items-center justify-between gap-3'>
        <span className='text-muted-foreground text-xs'>
          We open the page and an AI reads the recipe from it.
        </span>
        <Button
          type='button'
          size='sm'
          rounded='full'
          className='shrink-0 whitespace-nowrap'
          loading={isReading}
          disabled={isReading || link.trim() === ''}
          onClick={handleLink}
        >
          Read it
        </Button>
      </div>
    </div>
  );

  return (
    <div className='space-y-4'>
      <p className='text-muted-foreground text-sm'>
        Start from something you already have, or write it yourself. You’ll look
        it over before anything is saved.
      </p>
      <MethodPicker
        openId={openId}
        onOpenChange={handleOpenChange}
        disabled={isReading}
        methods={[
          {
            id: 'text',
            emoji: '📝',
            title: 'From text',
            description: 'Paste a recipe, say from a chat',
            panel: textPanel,
          },
          {
            id: 'photo',
            emoji: '📷',
            title: 'From a photo',
            description: 'A picture, screenshot or PDF',
            onPick: () => fileRef.current?.click(),
          },
          {
            id: 'link',
            emoji: '🔗',
            title: 'From a link',
            description: 'A recipe page on the web',
            panel: linkPanel,
          },
          {
            id: 'manual',
            emoji: '✍️',
            title: 'Write it yourself',
            description: 'Start with a blank recipe',
            onPick: onManual,
            isQuiet: true,
          },
        ]}
      />
      <Input
        key={pickerKey}
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
      {state.status === 'reading' && (
        <p className='text-muted-foreground truncate text-sm' role='status'>
          Reading {state.label}…
        </p>
      )}
      {state.status === 'failed' && (
        <p className='text-destructive text-sm break-words'>{state.message}</p>
      )}
    </div>
  );
}

export default RecipeStart;
