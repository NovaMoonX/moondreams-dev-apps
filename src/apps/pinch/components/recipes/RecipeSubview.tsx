import { useEffect, useRef, useState } from 'react';

import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useUnsavedWork } from '@/hooks/useUnsavedWork';
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
import {
  getRecipeDraftKey,
  readRecipeDraftTitle,
} from '@apps/pinch/components/recipes/recipeFormModel';
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
  const fromChangeIds =
    subview?.kind === 'recipe' ? (subview.fromChangeIds ?? []) : [];
  const fromCalendar =
    subview?.kind === 'recipe' && subview.fromCalendar === true;
  const isDirtyRef = useRef(false);
  useUnsavedWork(() => isDirtyRef.current);
  const backStepRef = useRef<(() => boolean) | null>(null);
  const isTypedRef = useRef(false);
  const isAskingRef = useRef(false);
  const existing =
    useAppSelector(selectRecipesById).get(recipeId ?? '') ?? null;
  const ideasById = useAppSelector(selectIdeasById);
  const notesById = useAppSelector(selectNotesById);
  const [fromChanges] = useState(() =>
    fromChangeIds.flatMap((id) => {
      const note = notesById.get(id);
      return note !== undefined &&
        note.kind === 'CHANGE' &&
        note.recipeId === recipeId
        ? [note]
        : [];
    }),
  );
  const [fromIdea] = useState(() =>
    recipeId === null ? (ideasById.get(fromIdeaId ?? '') ?? null) : null,
  );
  const [stage, setStage] = useState<Stage>(
    recipeId === null ? getStage(startMethod) : 'form',
  );
  const [read, setRead] = useState<RecipeRead | null>(null);
  const [kept, setKept] = useState<Kept | null>(null);
  const [title, setTitle] = useState(existing?.title ?? fromIdea?.title ?? '');
  const [draftTitle] = useState(() =>
    readRecipeDraftTitle(
      uid,
      getRecipeDraftKey(recipeId, fromIdea !== null || fromChanges.length > 0),
      existing?.updatedAt ?? null,
    ),
  );
  const [isTitleTouched, setIsTitleTouched] = useState(false);
  const changeTitle = (next: string) => {
    setIsTitleTouched(true);
    setTitle(next);
  };

  const stageRef = useRef(stage);

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

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

  const askToDiscard = async (title: string, message: string) => {
    if (isAskingRef.current) return false;
    isAskingRef.current = true;
    try {
      return await confirm({
        title,
        message,
        confirmText: 'Discard',
        cancelText: 'Keep editing',
        destructive: true,
      });
    } finally {
      isAskingRef.current = false;
    }
  };

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

  const confirmDiscardTyped = async (action: string) => {
    if (!isTypedRef.current) return true;
    const startedOn = stage;
    const what = startedOn === 'link' ? 'link' : 'text';
    const confirmed = await askToDiscard(
      `Discard this ${what}?`,
      `Nothing has been read or saved yet. If you ${action}, the ${what} is lost.`,
    );
    if (!confirmed || stageRef.current !== startedOn) return false;
    isTypedRef.current = false;
    return true;
  };

  const stepBackFromReader = async () => {
    if (!(await confirmDiscardTyped('go back now'))) return;
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

  const startBlank = async () => {
    if (await confirmDiscardTyped('start a blank recipe now')) {
      setStage('form');
    }
  };

  const switchToText = async () => {
    if (await confirmDiscardTyped('paste its text instead')) {
      setKept(null);
      setStage('text');
    }
  };

  const goBack = () => {
    if (backStepRef.current?.()) return;
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
      return (
        title.trim() ||
        (isTitleTouched ? '' : draftTitle?.trim()) ||
        existing?.title ||
        'New recipe'
      );
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
          initialChanges={fromChanges}
          isDirtyRef={isDirtyRef}
          backStepRef={backStepRef}
          onLeave={() => void leave()}
          onTitleChange={changeTitle}
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
        onRead={(recipe, source, label, extras) => {
          isTypedRef.current = false;
          const reading = fromIdea
            ? getReadingForIdea(recipe, fromIdea)
            : recipe;
          isDirtyRef.current = true;
          setRead({ recipe: reading, source, label, extras });
          setTitle(reading.title ?? '');
          setStage('form');
        }}
        onManual={() => void startBlank()}
        onPasteText={() => void switchToText()}
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
