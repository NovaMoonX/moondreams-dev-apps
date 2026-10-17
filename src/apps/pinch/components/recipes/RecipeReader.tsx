import { useCallback, useEffect, useRef, useState } from 'react';

import { Button, Input, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useQueryClient } from '@tanstack/react-query';
import { AIError } from 'firebase/ai';
import { Lightbulb, RefreshCw } from 'lucide-react';

import ActionChips, { type ActionChip } from '@/components/ActionChips';
import FilePickCard from '@/components/FilePickCard';
import FormSection from '@/components/FormSection';
import IntroCard from '@/components/IntroCard';
import MethodPicker, { type Method } from '@/components/MethodPicker';
import ModalFooterActions from '@/components/ModalFooterActions';
import { isReadableFile } from '@/utils/fileUtils';
import {
  MAX_PASTE_CHARS,
  MAX_UPLOAD_BYTES,
  RECIPE_START_METHODS,
} from '@apps/pinch/constants';
import {
  extractRecipeFromFile,
  extractRecipeFromPage,
  extractRecipeFromText,
  type ExtractedRecipe,
} from '@apps/pinch/lib/extractRecipe';
import { recipePageQueryOptions } from '@apps/pinch/queries/recipePageQueries';
import type { RecipeSource, RecipeStartMethod } from '@apps/pinch/types';
import {
  canPasteTextInstead,
  classifyReadFailure,
  getReadFailureLine,
  type ReadFailure,
} from '@apps/pinch/utils/readFailures';

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

type State =
  | { status: 'idle' }
  | { status: 'reading'; label: string }
  | { status: 'failed'; message: string; canPasteInstead: boolean };

type ReaderMethod = Exclude<RecipeStartMethod, 'manual'>;

const SAVED_LINE = 'You look it over before anything is saved.';

const failed = (message: string, canPasteInstead = false): State => ({
  status: 'failed',
  message,
  canPasteInstead,
});

const FIELD_CLASS =
  'rounded-none border-0 bg-transparent px-4 focus:outline-none';

const READER_COPY: Record<ReaderMethod, { caption: string; lead: string }> = {
  link: {
    caption: 'Recipe link',
    lead: 'An AI reads the page and fills in the form.',
  },
  text: {
    caption: 'Recipe text',
    lead: 'An AI reads your text and fills in the form.',
  },
  file: {
    caption: 'Recipe file',
    lead: 'An AI reads the file and fills in the form.',
  },
};

const getMethodEmoji = (id: RecipeStartMethod) =>
  RECIPE_START_METHODS.find((method) => method.id === id)?.emoji ?? '📝';

const MANUAL_METHOD = RECIPE_START_METHODS.find(
  (method) => method.id === 'manual',
);

/** Whether the screen is still on show, so a reading that finishes after the person went back doesn't carry them forward. */
function useIsMounted() {
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return useCallback(() => isMountedRef.current, []);
}

interface RecipeReaderProps {
  method: ReaderMethod;
  /** A link the person already has, so the link way opens with it filled in; nothing is sent until they tap the button. */
  initialUrl?: string;
  /** The idea that link came from, named in the card at the top. */
  ideaTitle?: string;
  /** Called with what the reader found; the form fills what was read and the person reviews it before saving. */
  onRead: (
    recipe: ExtractedRecipe,
    source: RecipeSource,
    label: string,
  ) => void;
  onManual: () => void;
  /** Switches a link that would not open to pasting the page's text; the link is typed work, so the screen above asks before it is lost. */
  onPasteText?: () => void;
  /** The footer's Back: the same step as the header's back button. */
  onBack: () => void;
  /** Whether the person is holding a pasted link or text that going back would lose. */
  onTypedChange?: (isTyped: boolean) => void;
  /** What the person had typed before stepping away, so coming back keeps it. */
  initialText?: string;
  initialLink?: string;
  /** Keeps the pasted text or link as an idea instead of reading it now. */
  onSaveAsIdea?: (kept: { text: string } | { link: string }) => void;
}

/** One way of starting a recipe, finished on its own screen: say what the AI will do, take the text, link or file, and read it from a pinned footer. */
function RecipeReader({
  method,
  initialUrl,
  ideaTitle,
  onRead,
  onManual,
  onBack,
  onPasteText,
  onTypedChange,
  initialText = '',
  initialLink = '',
  onSaveAsIdea,
}: RecipeReaderProps) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<State>({ status: 'idle' });
  const [text, setText] = useState(initialText);
  const [link, setLink] = useState(initialUrl ?? initialLink);
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const isMounted = useIsMounted();
  const isReading = state.status === 'reading';
  const canPasteText = initialUrl === undefined;
  const typed = method === 'text' ? text : link;
  const copy = READER_COPY[method];

  useEffect(() => {
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      (method === 'text' ? textRef : linkRef).current?.focus();
    }
  }, [method]);

  const fail = (cause: ReadFailure, source: RecipeSource) =>
    setState(
      failed(
        getReadFailureLine(cause, source),
        method === 'link' && canPasteText && canPasteTextInstead(cause),
      ),
    );

  const run = async (
    label: string,
    source: RecipeSource,
    read: () => Promise<ExtractedRecipe>,
  ) => {
    setState({ status: 'reading', label });
    try {
      const extracted = await read();
      if (!isMounted()) {
        return;
      }
      if (extracted.ingredients.length === 0) {
        fail('empty', source);
        return;
      }

      onRead(extracted, source, label);
    } catch (error) {
      console.error(
        'Reading the recipe failed',
        error,
        error instanceof AIError ? error.customErrorData : null,
      );
      if (!isMounted()) {
        return;
      }
      fail(classifyReadFailure(error, navigator.onLine), source);
    } finally {
      setFileKey((current) => current + 1);
    }
  };

  const rejectFile = (message: string) => {
    setFile(null);
    setState(failed(message));
    setFileKey((current) => current + 1);
  };

  const handleFile = (next: File) => {
    if (!isReadableFile(next)) {
      rejectFile("That file isn't a photo or a PDF.");
      return;
    }
    if (next.size > MAX_UPLOAD_BYTES) {
      rejectFile(
        'That file is too big to read. Try a photo or a PDF under 10 MB.',
      );
      return;
    }

    setFile(next);
    void run(next.name, 'AI_FILE', () => extractRecipeFromFile(next));
  };

  const handleLink = () => {
    const url = asWebLink(link);
    if (url === null) {
      setState(
        failed("That doesn't look like a web link. Check it and try again."),
      );
      return;
    }

    void run(new URL(url).hostname, 'AI_LINK', async () =>
      extractRecipeFromPage(
        await queryClient.fetchQuery(recipePageQueryOptions(url)),
      ),
    );
  };

  const handleRetryFile = () => {
    if (file !== null) {
      handleFile(file);
    }
  };

  const handleText = () =>
    void run('your text', 'AI_TEXT', () => extractRecipeFromText(text));

  const handleTyped = (next: string) => {
    onTypedChange?.(next.trim() !== '' && next !== (initialUrl ?? ''));
    setState((current) =>
      current.status === 'failed' ? { status: 'idle' } : current,
    );
  };

  const getStatus = () => {
    if (state.status === 'reading') {
      return (
        <p className='text-muted-foreground truncate text-sm' role='status'>
          Reading {method === 'file' ? 'the file' : state.label}…
        </p>
      );
    }
    if (state.status === 'failed') {
      return (
        <p className='text-destructive text-sm break-words' role='alert'>
          {state.message}
        </p>
      );
    }
    return null;
  };

  const getStatusLine = () =>
    getStatus() ?? <p className='text-muted-foreground text-xs'>{getHint()}</p>;

  const getField = () => {
    if (method === 'text') {
      return (
        <Textarea
          ref={textRef}
          rows={8}
          variant='base'
          rounded='none'
          aria-label='Paste a recipe'
          placeholder='A recipe from a chat or a note'
          maxLength={MAX_PASTE_CHARS}
          className={join(FIELD_CLASS, 'py-3')}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            handleTyped(event.target.value);
          }}
        />
      );
    }

    return (
      <Input
        ref={linkRef}
        type='url'
        inputMode='url'
        variant='base'
        rounded='none'
        aria-label='Paste a recipe link'
        placeholder='https://…'
        className={join(FIELD_CLASS, 'h-14')}
        value={link}
        onChange={(event) => {
          setLink(event.target.value);
          handleTyped(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && link.trim() !== '' && !isReading) {
            event.preventDefault();
            handleLink();
          }
        }}
      />
    );
  };

  const getIntro = () =>
    ideaTitle === undefined || initialUrl === undefined
      ? { lead: copy.lead, rest: SAVED_LINE }
      : {
          lead: `From your idea: ${ideaTitle}`,
          rest: 'We open its link, and an AI reads the page and fills in the form. You look it over before anything is saved.',
        };

  const getHint = () => {
    if (method === 'file') {
      return 'Clear, straight-on photos read best.';
    }
    if (method === 'text') {
      return `Up to ${MAX_PASTE_CHARS.toLocaleString()} characters.`;
    }
    if (!canPasteText) {
      return 'The address saved with your idea.';
    }
    return "Copy the address from your browser's address bar.";
  };

  const getChips = (): ActionChip[] => {
    if (method === 'file') {
      return file !== null && state.status === 'failed'
        ? [
            {
              key: 'retry',
              icon: <RefreshCw className='h-4 w-4' />,
              label: 'Try this file again',
              onClick: handleRetryFile,
            },
          ]
        : [];
    }
    if (!onSaveAsIdea) {
      return [];
    }

    return [
      {
        key: 'idea',
        icon: <Lightbulb className='h-4 w-4' />,
        label: 'Save as an idea',
        description: 'Save as an idea instead of reading it',
        isDisabled: isReading || typed.trim() === '',
        onClick: () => onSaveAsIdea(method === 'text' ? { text } : { link }),
      },
    ];
  };

  const getNote = () => {
    if (method === 'file' || isReading || typed.trim() !== '') {
      return null;
    }
    return method === 'link' ? 'Paste a link first' : 'Paste the recipe first';
  };

  const getPrimary = () => {
    if (method === 'file') {
      return (
        <Button
          type='button'
          loading={isReading}
          disabled={isReading}
          onClick={() => fileRef.current?.click()}
        >
          {file !== null && state.status === 'failed'
            ? 'Choose another file'
            : 'Choose a file'}
        </Button>
      );
    }

    return (
      <Button
        type='button'
        loading={isReading}
        disabled={isReading || typed.trim() === ''}
        onClick={method === 'link' ? handleLink : handleText}
      >
        Fill in the recipe
      </Button>
    );
  };

  const getMethods = (): Method[] => [
    ...(state.status === 'failed' && state.canPasteInstead && onPasteText
      ? [
          {
            id: 'paste-text',
            emoji: getMethodEmoji('text'),
            title: 'Paste its text instead',
            description: 'Copy the recipe from the page',
            isQuiet: true,
            onPick: onPasteText,
          },
        ]
      : []),
    ...(MANUAL_METHOD
      ? [{ ...MANUAL_METHOD, isQuiet: true, onPick: onManual }]
      : []),
  ];

  const intro = getIntro();

  return (
    <div className='flex flex-1 flex-col gap-4 [@media(min-height:700px)]:gap-6'>
      <IntroCard icon={getMethodEmoji(method)} lead={intro.lead}>
        {intro.rest}
      </IntroCard>
      <FormSection title={copy.caption}>
        {method === 'file' ? (
          <FilePickCard
            title='Tap to choose a file'
            accepts='Photo, screenshot or PDF'
            limit={`up to ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB`}
            picked={
              file && {
                name: file.name,
                size: file.size,
                emoji: file.type === 'application/pdf' ? '📄' : '🖼️',
              }
            }
            status={getStatusLine()}
            isDisabled={isReading}
            onPick={() => fileRef.current?.click()}
            onDropFile={handleFile}
          />
        ) : (
          <div className='border-border bg-card focus-within:border-foreground/40 overflow-hidden rounded-2xl border'>
            {getField()}
            <div className='border-border border-t px-4 py-2.5'>
              {getStatusLine()}
            </div>
          </div>
        )}
      </FormSection>
      <ActionChips actions={getChips()} label='What else you can do with it' />
      <MethodPicker disabled={isReading} methods={getMethods()} />
      {method === 'file' && (
        <Input
          key={fileKey}
          ref={fileRef}
          type='file'
          accept='application/pdf,image/*'
          aria-label='Upload a recipe'
          className='hidden'
          onChange={(event) => {
            const next = event.target.files?.[0];
            if (next) handleFile(next);
          }}
        />
      )}
      <ModalFooterActions
        note={getNote()}
        cancelAction={
          <Button type='button' variant='secondary' onClick={onBack}>
            Back
          </Button>
        }
        rightActions={getPrimary()}
      />
    </div>
  );
}

export default RecipeReader;
