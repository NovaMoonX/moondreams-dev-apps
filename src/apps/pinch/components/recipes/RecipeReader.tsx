import { useCallback, useEffect, useRef, useState } from 'react';

import { Button, Input, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useQueryClient } from '@tanstack/react-query';
import { AIError } from 'firebase/ai';
import { Lightbulb, Plus, X } from 'lucide-react';

import AppToggle from '@/components/AppToggle';
import ActionChips, { type ActionChip } from '@/components/ActionChips';
import FilePickCard from '@/components/FilePickCard';
import FormSection from '@/components/FormSection';
import IntroCard from '@/components/IntroCard';
import LinkPreviewCard from '@/components/LinkPreviewCard';
import MethodPicker, { type Method } from '@/components/MethodPicker';
import ModalFooterActions from '@/components/ModalFooterActions';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useGrowingTextarea } from '@/hooks/useGrowingTextarea';
import { useLinkPreview } from '@/hooks/useLinkPreview';
import { useAppSelector } from '@/store';
import { useCanTakePhoto } from '@/hooks/useCanTakePhoto';
import { isReadableFile, openFileChooser } from '@/utils/fileUtils';
import { fitsReadLimit } from '@/utils/imageCompression';
import { toWebLink } from '@/utils/urlUtils';
import IdeaRow from '@apps/pinch/components/ideas/IdeaRow';
import {
  MAX_GUIDANCE_CHARS,
  MAX_PASTE_CHARS,
  MAX_RECIPE_FILES,
  MAX_UPLOAD_BYTES,
  RECIPE_START_METHODS,
} from '@apps/pinch/constants';
import {
  extractRecipeFromFiles,
  extractRecipeFromPage,
  extractRecipeFromText,
  extractRecipeFromVideo,
  type ExtractedRecipe,
} from '@apps/pinch/lib/extractRecipe';
import { recipePageQueryOptions } from '@apps/pinch/queries/recipePageQueries';
import {
  selectIdeaGroups,
  selectPinchSettings,
} from '@apps/pinch/store/selectors';
import type { RecipeSource, RecipeStartMethod } from '@apps/pinch/types';
import {
  getPageExtras,
  getVideoExtras,
  NO_EXTRAS,
  type ReadExtras,
} from '@apps/pinch/utils/readExtras';
import { getYouTubeId } from '@apps/pinch/utils/recipeLinks';
import {
  canPasteTextInstead,
  classifyReadFailure,
  getReadFailureLine,
  type ReadFailure,
} from '@apps/pinch/utils/readFailures';

type State =
  | { status: 'idle' }
  | { status: 'reading'; label: string }
  | { status: 'failed'; message: string; canPasteInstead: boolean };

type ReaderMethod = Exclude<RecipeStartMethod, 'manual'>;

interface Reading {
  recipe: ExtractedRecipe;
  extras: ReadExtras;
}

const toReading = (recipe: ExtractedRecipe): Reading => ({
  recipe,
  extras: NO_EXTRAS,
});

const SAVED_LINE = 'You look it over before anything is saved.';

const GUIDANCE_MAX_LINES = 4;

const getFinishingSubtitle = (isFinishing: boolean, isSettingOn: boolean) => {
  if (isSettingOn) {
    return isFinishing
      ? 'Adds missing steps and realistic times'
      : 'Off for this recipe only. To turn it off for every recipe, change it in Settings.';
  }
  return isFinishing
    ? 'On for this recipe only'
    : 'Reads only what you give it';
};

const IDEAS_SHOWN = 3;
const IDEAS_SHOWN_MOST = 10;

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
  /** Called with what the reader found and what the source offers beyond the recipe (its picture, its address); the form fills what was read and the person reviews it before saving. */
  onRead: (
    recipe: ExtractedRecipe,
    source: RecipeSource,
    label: string,
    extras: ReadExtras,
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

const getPicked = (files: readonly File[]) => {
  const [first] = files;
  if (first === undefined) return null;
  const size = files.reduce((total, one) => total + one.size, 0);
  if (files.length === 1) {
    return {
      name: first.name,
      size,
      emoji: first.type === 'application/pdf' ? '📄' : '🖼️',
    };
  }
  return {
    name: `${files.length} files, read as one recipe`,
    size,
    emoji: '🗂️',
  };
};

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
  const [files, setFiles] = useState<File[]>([]);
  const [fileKey, setFileKey] = useState(0);
  const [fileInput, setFileInput] = useState<HTMLInputElement | null>(null);
  const linkRef = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const guidanceRef = useRef<HTMLTextAreaElement>(null);
  const [guidanceText, setGuidanceText] = useState('');
  const isSettingOn = useAppSelector(selectPinchSettings).isFinishingRecipes;
  const [finishChoice, setFinishChoice] = useState<boolean | null>(null);
  const isFinishing = finishChoice ?? isSettingOn;
  const isMounted = useIsMounted();
  const isReading = state.status === 'reading';
  const canPasteText = initialUrl === undefined;
  const getTyped = () => {
    if (method === 'text') return text;
    if (method === 'file') return files.length === 0 ? '' : 'picked';
    return link;
  };
  const typed = getTyped();
  const copy = READER_COPY[method];
  const guidance = guidanceText.trim() || null;
  useGrowingTextarea(guidanceRef, guidanceText, GUIDANCE_MAX_LINES);
  const [isIdeasOpen, setIsIdeasOpen] = useState(false);
  const toTry = useAppSelector(selectIdeaGroups).toTry;
  const linkIdeas =
    method === 'link' && canPasteText
      ? toTry.filter((idea) => idea.url != null && toWebLink(idea.url) !== null)
      : [];
  const canFoldIdeas = linkIdeas.length > IDEAS_SHOWN * 2;
  const shownIdeas = linkIdeas.slice(
    0,
    canFoldIdeas && !isIdeasOpen ? IDEAS_SHOWN : IDEAS_SHOWN_MOST,
  );

  // The reading's own request, so the preview and "Fill in the recipe" share one page fetch.
  const preview = useLinkPreview(method === 'link' ? link : '', {
    getQueryOptions: recipePageQueryOptions,
    isEnabled: canPasteText && getYouTubeId(link) === null,
  });

  useEffect(() => {
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      (method === 'text' ? textRef : linkRef).current?.focus();
    }
  }, [method]);

  const fail = (cause: ReadFailure, source: RecipeSource, isVideo: boolean) =>
    setState(
      failed(
        getReadFailureLine(cause, source, isVideo),
        method === 'link' && canPasteText && canPasteTextInstead(cause),
      ),
    );

  const run = async (
    label: string,
    source: RecipeSource,
    read: () => Promise<Reading>,
    isVideo = false,
  ) => {
    setState({ status: 'reading', label });
    try {
      const { recipe: extracted, extras } = await read();
      if (!isMounted()) {
        return;
      }
      if (extracted.ingredients.length === 0) {
        fail('empty', source, isVideo);
        return;
      }

      onRead(extracted, source, label, extras);
    } catch (error) {
      console.error(
        'Reading the recipe failed',
        error,
        error instanceof AIError ? error.customErrorData : null,
      );
      if (!isMounted()) {
        return;
      }
      fail(classifyReadFailure(error, navigator.onLine), source, isVideo);
    } finally {
      setFileKey((current) => current + 1);
    }
  };

  const rejectFile = (message: string) => {
    setState(failed(message));
    setFileKey((current) => current + 1);
  };

  const handleFiles = async (picked: File[]) => {
    const room = MAX_RECIPE_FILES - files.length;
    if (room <= 0) {
      rejectFile(
        `That's ${MAX_RECIPE_FILES} files already, the most one recipe reads.`,
      );
      return;
    }
    const next = picked.slice(0, room);
    if (next.some((one) => !isReadableFile(one))) {
      rejectFile("That file isn't a photo or a PDF.");
      return;
    }
    const pdfBytes = [...files, ...next]
      .filter((one) => one.type === 'application/pdf')
      .reduce((total, one) => total + one.size, 0);
    const fits = await Promise.all(
      next.map((one) => fitsReadLimit(one, MAX_UPLOAD_BYTES)),
    );
    if (fits.includes(false) || pdfBytes > MAX_UPLOAD_BYTES) {
      rejectFile(
        'That is too big to read. Try photos, or PDFs under 10 MB in all.',
      );
      return;
    }

    setFiles((current) => [...current, ...next].slice(0, MAX_RECIPE_FILES));
    reportTyped('picked', guidanceText);
    if (picked.length > room) {
      setState(
        failed(
          `Up to ${MAX_RECIPE_FILES} files, so only ${room === 1 ? 'the first one was' : `the first ${room} were`} added.`,
        ),
      );
      setFileKey((current) => current + 1);
      return;
    }
    setState({ status: 'idle' });
    setFileKey((current) => current + 1);
  };

  const chooseFile = () => openFileChooser(fileInput);

  const clearFiles = () => {
    setFiles([]);
    reportTyped('', guidanceText);
    setState({ status: 'idle' });
  };

  const readFile = () => {
    const [first] = files;
    if (first === undefined) return;
    void run(first.name, 'AI_FILE', async () =>
      toReading(await extractRecipeFromFiles(files, guidance, isFinishing)),
    );
  };

  const handleLink = () => {
    const url = toWebLink(link);
    if (url === null) {
      setState(
        failed("That doesn't look like a web link. Check it and try again."),
      );
      return;
    }

    const videoId = getYouTubeId(url);
    if (videoId !== null) {
      void run(
        'youtube.com',
        'AI_LINK',
        async () => ({
          recipe: await extractRecipeFromVideo(videoId, guidance, isFinishing),
          extras: getVideoExtras(url),
        }),
        true,
      );
      return;
    }

    void run(new URL(url).hostname, 'AI_LINK', async () => {
      const page = await queryClient.fetchQuery(recipePageQueryOptions(url));
      return {
        recipe: await extractRecipeFromPage(page, guidance, isFinishing),
        extras: getPageExtras(page, url),
      };
    });
  };

  const fillFromIdea = (ideaId: string) => {
    const url = linkIdeas.find((idea) => idea.id === ideaId)?.url;
    if (url == null) {
      return;
    }
    setLink(url);
    handleTyped(url);
  };

  const handleText = () =>
    void run('your text', 'AI_TEXT', async () =>
      toReading(await extractRecipeFromText(text, guidance, isFinishing)),
    );

  const reportTyped = (main: string, guide: string) =>
    onTypedChange?.(
      (main.trim() !== '' && main !== (initialUrl ?? '')) ||
        guide.trim() !== '',
    );

  const handleTyped = (next: string) => {
    reportTyped(next, guidanceText);
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
      <Textarea
        ref={linkRef}
        rows={1}
        inputMode='url'
        autoCapitalize='none'
        autoCorrect='off'
        spellCheck={false}
        variant='base'
        rounded='none'
        aria-label='Paste a recipe link'
        placeholder='https://…'
        className={join(
          FIELD_CLASS,
          'field-sizing-content min-h-14 py-4 max-sm:flex-1 max-sm:resize-none',
        )}
        value={link}
        onChange={(event) => {
          setLink(event.target.value);
          handleTyped(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;

          event.preventDefault();
          if (link.trim() !== '' && !isReading) handleLink();
        }}
      />
    );
  };

  const getGuidanceField = () => (
    <div className='border-border focus-within:border-foreground/40 rounded-xl border'>
      <p aria-hidden className='text-muted-foreground px-4 pt-2 text-xs'>
        Guidance for the AI (optional)
      </p>
      <Textarea
        aria-label='Guidance for the AI (optional)'
        ref={guidanceRef}
        rows={2}
        variant='base'
        rounded='none'
        placeholder="It's the second recipe on the page. I'm making it for 2, with chicken."
        maxLength={MAX_GUIDANCE_CHARS}
        disabled={isReading}
        className={join(FIELD_CLASS, 'min-h-0 resize-none py-1.5 text-sm')}
        value={guidanceText}
        onChange={(event) => {
          setGuidanceText(event.target.value);
          reportTyped(typed, event.target.value);
        }}
      />
    </div>
  );

  const getIntro = () => {
    if (ideaTitle === undefined || initialUrl === undefined) {
      return { lead: copy.lead, rest: SAVED_LINE };
    }
    const isVideo = getYouTubeId(initialUrl) !== null;
    return {
      lead: `From your idea: ${ideaTitle}`,
      rest: isVideo
        ? 'An AI watches and listens to the video and fills in the form. You look it over before anything is saved.'
        : 'We open its link, and an AI reads the page and fills in the form. You look it over before anything is saved.',
    };
  };

  const getHint = () => {
    if (method === 'file') {
      return files.length === 0
        ? `Clear, straight-on photos read best. Up to ${MAX_RECIPE_FILES} for one recipe.`
        : 'Add guidance below if you like, then tap Fill in the recipe.';
    }
    if (method === 'text') {
      return `Up to ${MAX_PASTE_CHARS.toLocaleString()} characters.`;
    }
    if (getYouTubeId(link) !== null) {
      return 'An AI watches the video, which can take a minute. It must be public.';
    }
    if (!canPasteText) {
      return 'The address saved with your idea.';
    }
    return 'Copy the address from your browser. We open the page to find its title and picture.';
  };

  const getChips = (): ActionChip[] => {
    if (method === 'file') {
      if (files.length === 0) return [];
      return [
        ...(files.length < MAX_RECIPE_FILES
          ? [
              {
                key: 'another',
                icon: <Plus className='h-4 w-4' />,
                label: 'Add another file',
                description: `Add a page or photo, up to ${MAX_RECIPE_FILES}`,
                isDisabled: isReading,
                onClick: chooseFile,
              },
            ]
          : []),
        {
          key: 'clear',
          icon: <X className='h-4 w-4' />,
          label: files.length === 1 ? 'Remove the file' : 'Remove the files',
          isDisabled: isReading,
          onClick: clearFiles,
        },
      ];
    }
    const clearChips: ActionChip[] =
      method === 'text' || canPasteText
        ? [
            {
              key: 'clear',
              icon: <X className='h-4 w-4' />,
              label: 'Clear',
              description:
                method === 'text' ? 'Clear the text' : 'Clear the link',
              isDisabled: isReading || (typed === '' && guidanceText === ''),
              onClick: () => {
                (method === 'text' ? setText : setLink)('');
                setGuidanceText('');
                reportTyped('', '');
                setState((current) =>
                  current.status === 'failed' ? { status: 'idle' } : current,
                );
                (method === 'text' ? textRef : linkRef).current?.focus();
              },
            },
          ]
        : [];
    if (!onSaveAsIdea) {
      return clearChips;
    }

    return [
      ...clearChips,
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

  const isTouch = useCanTakePhoto();

  const getNote = () => {
    if (method === 'file' || isReading || typed.trim() !== '') {
      return null;
    }
    return method === 'link' ? 'Paste a link first' : 'Paste the recipe first';
  };

  const getPrimary = () => {
    if (method === 'file' && isTouch && files.length === 0) return null;
    if (method === 'file' && files.length === 0) {
      return (
        <Button type='button' onClick={() => openFileChooser(fileInput)}>
          Choose a file
        </Button>
      );
    }
    if (method === 'file') {
      return (
        <Button
          type='button'
          loading={isReading}
          disabled={isReading}
          onClick={readFile}
        >
          Fill in the recipe
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
            description: 'Copy it from the page',
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
      <FormSection
        title={copy.caption}
        isFilling={
          method === 'link' || (method === 'file' && files.length === 0)
        }
      >
        {method === 'file' ? (
          <FilePickCard
            title='Tap to choose files'
            accepts='Photo, screenshot or PDF'
            limit={`PDF up to ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB`}
            picked={getPicked(files)}
            status={getStatusLine()}
            isDisabled={isReading}
            isFilling={files.length === 0}
            onPick={() => openFileChooser(fileInput)}
            onTakePhoto={() => openFileChooser(fileInput, { isCamera: true })}
            onDropFile={(dropped) => void handleFiles([dropped])}
          />
        ) : (
          <div
            className={join(
              'border-border bg-card focus-within:border-foreground/40 overflow-hidden rounded-2xl border',
              method === 'link' && 'max-sm:flex max-sm:flex-1 max-sm:flex-col',
            )}
          >
            {getField()}
            <div className='border-border border-t px-4 py-2.5'>
              {getStatusLine()}
            </div>
          </div>
        )}
        {getGuidanceField()}
        <label className='flex items-start justify-between gap-3 px-1'>
          <span className='min-w-0'>
            <span className='block text-sm font-medium'>
              Finish it like a cookbook
            </span>
            <span className='text-muted-foreground block text-xs text-pretty'>
              {getFinishingSubtitle(isFinishing, isSettingOn)}
            </span>
          </span>
          <AppToggle
            aria-label='Finish it like a cookbook'
            checked={isFinishing}
            disabled={isReading}
            onCheckedChange={setFinishChoice}
          />
        </label>
        {preview !== null && <LinkPreviewCard preview={preview} />}
      </FormSection>
      <ActionChips actions={getChips()} label='What else you can do with it' />
      {method === 'link' && canPasteText && linkIdeas.length > 0 && (
        <FormSection title='Links from your ideas'>
          <ul className='border-border divide-border divide-y rounded-2xl border px-3'>
            {shownIdeas.map((idea) => (
              <li key={idea.id}>
                <IdeaRow idea={idea} onOpen={fillFromIdea} />
              </li>
            ))}
          </ul>
          {canFoldIdeas && (
            <ShowMoreButton
              isOpen={isIdeasOpen}
              onClick={() => setIsIdeasOpen((open) => !open)}
            >
              {isIdeasOpen
                ? 'Show fewer'
                : `Show ${Math.min(linkIdeas.length, IDEAS_SHOWN_MOST) - IDEAS_SHOWN} more`}
            </ShowMoreButton>
          )}
        </FormSection>
      )}
      <MethodPicker disabled={isReading} methods={getMethods()} />
      {method === 'file' && (
        <Input
          key={fileKey}
          ref={setFileInput}
          type='file'
          multiple
          accept='application/pdf,image/*'
          aria-label='Upload a recipe'
          className='hidden'
          onChange={(event) => {
            const picked = Array.from(event.target.files ?? []);
            if (picked.length > 0) void handleFiles(picked);
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
