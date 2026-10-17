import { useRef, useState } from 'react';

import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import Subview from '@/components/Subview';
import { toWebLink } from '@/utils/urlUtils';
import {
  IdeaLinkWay,
  IdeaTextWay,
} from '@apps/pinch/components/ideas/IdeaWays';
import { useAppSelector } from '@/store';
import RecipeForm, {
  type RecipeRead,
} from '@apps/pinch/components/recipes/RecipeForm';
import RecipeReader from '@apps/pinch/components/recipes/RecipeReader';
import RecipeStart from '@apps/pinch/components/recipes/RecipeStart';
import {
  MAX_IDEA_NOTE_LENGTH,
  RECIPE_START_METHODS,
} from '@apps/pinch/constants';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import {
  selectIdeasById,
  selectNotesById,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import type { RecipeStartMethod } from '@apps/pinch/types';
import { clipIdeaTitle, getReadingForIdea } from '@apps/pinch/utils/ideas';

type Stage = 'start' | 'form' | 'idea' | Exclude<RecipeStartMethod, 'manual'>;

type Kept = { text: string } | { link: string };

const getTextIdea = (text: string) => {
  const trimmed = text.trim();
  const title = clipIdeaTitle(
    trimmed.split('\n').find((line) => line.trim() !== '') ?? '',
  );
  return {
    title,
    note: trimmed.slice(0, MAX_IDEA_NOTE_LENGTH),
    isClipped: trimmed.length > MAX_IDEA_NOTE_LENGTH,
  };
};

const getStage = (method: RecipeStartMethod | undefined): Stage => {
  if (method === undefined) return 'start';
  return method === 'manual' ? 'form' : method;
};

interface RecipeSubviewProps {
  uid: string;
  recipeId: string | null;
}

/** The recipe as a full-screen layer: a new one begins with how to start it, each way finishes on its own screen, then the form, whose header carries the recipe's name. */
function RecipeSubview({ uid, recipeId }: RecipeSubviewProps) {
  const { subview, closeSubview, setIsStartOpen, openIdeaSheet } =
    usePinchOverlay();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const startMethod = subview?.kind === 'recipe' ? subview.method : undefined;
  const fromDrawer = subview?.kind === 'recipe' && subview.fromDrawer === true;
  const fromIdeaId =
    subview?.kind === 'recipe' ? (subview.fromIdeaId ?? null) : null;
  const fromNoteId =
    subview?.kind === 'recipe' ? (subview.fromNoteId ?? null) : null;
  const fromCalendar =
    subview?.kind === 'recipe' && subview.fromCalendar === true;
  const isDirtyRef = useRef(false);
  const isTypedRef = useRef(false);
  const existing =
    useAppSelector(selectRecipesById).get(recipeId ?? '') ?? null;
  const ideasById = useAppSelector(selectIdeasById);
  const notesById = useAppSelector(selectNotesById);
  const [fromNote] = useState(() => {
    const note = notesById.get(fromNoteId ?? '') ?? null;
    return note !== null && note.recipeId === recipeId ? note : null;
  });
  const [fromIdea] = useState(() =>
    recipeId === null ? (ideasById.get(fromIdeaId ?? '') ?? null) : null,
  );
  const [stage, setStage] = useState<Stage>(
    recipeId === null ? getStage(startMethod) : 'form',
  );
  const [read, setRead] = useState<RecipeRead | null>(null);
  const [kept, setKept] = useState<Kept | null>(null);
  const [title, setTitle] = useState(existing?.title ?? fromIdea?.title ?? '');

  const isReaderStage =
    stage !== 'start' && stage !== 'form' && stage !== 'idea';
  const backToReader = () => setStage(kept && 'link' in kept ? 'link' : 'text');
  const handleIdeaSaved = (ideaTitle: string) => {
    closeSubview();
    addToast({
      title: `Saved ${ideaTitle} to your ideas`,
      description: navigator.onLine
        ? undefined
        : "It's on this phone and saves when you're back online.",
      type: 'success',
    });
  };

  const askToDiscard = (title: string, message: string) =>
    confirm({
      title,
      message,
      confirmText: 'Discard',
      cancelText: 'Keep editing',
      destructive: true,
    });

  const leave = async () => {
    if (isDirtyRef.current) {
      const confirmed = await askToDiscard(
        'Discard this recipe?',
        "It isn't saved yet. If you leave now, what you typed or read in is lost.",
      );
      if (!confirmed) return;
    }
    closeSubview();
  };

  const stepBackFromReader = async () => {
    if (isTypedRef.current) {
      const what = stage === 'link' ? 'link' : 'text';
      const confirmed = await askToDiscard(
        `Discard this ${what}?`,
        `Nothing has been read or saved yet. If you go back now, the ${what} is lost.`,
      );
      if (!confirmed) return;
      isTypedRef.current = false;
    }
    if (fromIdea) {
      closeSubview();
      return;
    }
    if (fromDrawer) {
      closeSubview();
      setIsStartOpen(true, fromCalendar);
      return;
    }
    setStage('start');
  };

  const goBack = () => {
    if (stage === 'idea') {
      backToReader();
      return;
    }
    if (isReaderStage) {
      void stepBackFromReader();
      return;
    }
    void leave();
  };

  const getTitle = () => {
    if (stage === 'start') return 'New recipe';
    if (stage === 'idea') return 'Idea';
    if (stage === 'form')
      return title.trim() || existing?.title || 'New recipe';
    return (
      RECIPE_START_METHODS.find((method) => method.id === stage)?.title ??
      'New recipe'
    );
  };

  const getBody = () => {
    if (stage === 'start') {
      return (
        <RecipeStart
          onPick={(method) => setStage(getStage(method))}
          onKeepAsIdea={() => {
            closeSubview();
            openIdeaSheet();
          }}
        />
      );
    }
    if (stage === 'idea') {
      if (kept === null) return null;
      if ('link' in kept) {
        return (
          <IdeaLinkWay
            uid={uid}
            initialUrl={toWebLink(kept.link) ?? kept.link.trim()}
            onClose={backToReader}
            onSaved={handleIdeaSaved}
          />
        );
      }
      const idea = getTextIdea(kept.text);
      return (
        <div className='space-y-4'>
          <p className='text-muted-foreground text-sm'>
            {idea.isClipped
              ? `Kept as an idea, with the first ${MAX_IDEA_NOTE_LENGTH.toLocaleString()} characters of your text as its note. Nothing is read or sent to an AI.`
              : 'Kept as an idea, with your text as its note. Nothing is read or sent to an AI.'}
          </p>
          <IdeaTextWay
            uid={uid}
            initialTitle={idea.title}
            initialNote={idea.note}
            onClose={backToReader}
            onSaved={handleIdeaSaved}
          />
        </div>
      );
    }
    if (stage === 'form') {
      return (
        <RecipeForm
          key={recipeId ?? 'new'}
          uid={uid}
          recipeId={recipeId}
          initialRead={read}
          initialIdea={fromIdea}
          initialNote={fromNote}
          isDirtyRef={isDirtyRef}
          onLeave={() => void leave()}
          onTitleChange={setTitle}
        />
      );
    }
    return (
      <RecipeReader
        key={stage}
        method={stage}
        ideaTitle={fromIdea?.title}
        initialUrl={
          stage === 'link' && fromIdea?.kind === 'LINK'
            ? (fromIdea.url ?? undefined)
            : undefined
        }
        initialText={kept && 'text' in kept ? kept.text : undefined}
        initialLink={kept && 'link' in kept ? kept.link : undefined}
        onBack={goBack}
        onTypedChange={(isTyped) => {
          isTypedRef.current = isTyped;
        }}
        onRead={(recipe, source, label) => {
          isTypedRef.current = false;
          const reading = fromIdea
            ? getReadingForIdea(recipe, fromIdea)
            : recipe;
          isDirtyRef.current = true;
          setRead({ recipe: reading, source, label });
          setTitle(reading.title ?? '');
          setStage('form');
        }}
        onManual={() => {
          isTypedRef.current = false;
          setStage('form');
        }}
        onSaveAsIdea={
          fromIdea
            ? undefined
            : (next) => {
                setKept(next);
                setStage('idea');
              }
        }
      />
    );
  };

  return (
    <Subview overlay title={getTitle()} onClose={closeSubview} onBack={goBack}>
      {getBody()}
    </Subview>
  );
}

export default RecipeSubview;
