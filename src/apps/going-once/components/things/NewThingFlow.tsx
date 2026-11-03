import { useEffect, useRef, useState, type MutableRefObject } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check, Plus } from 'lucide-react';

import AddFieldChips from '@/components/forms/AddFieldChips';
import OptionalDetailRows from '@/components/forms/OptionalDetailRows';
import PhotoSetPicker from '@/components/forms/PhotoSetPicker';
import ModalFooterActions from '@/components/ModalFooterActions';
import QuestionFlow from '@/components/QuestionFlow';
import Subview from '@/components/Subview';
import { usePhotoSetUploads } from '@/hooks/usePhotoSetUploads';
import { useQuestionFlow, type QuestionStep } from '@/hooks/useQuestionFlow';
import { useUndoRemoval } from '@/hooks/useUndoRemoval';
import { useAppDispatch, useAppSelector } from '@/store';
import { generateUuid } from '@/utils';
import { formatCentsShort } from '@/utils/moneyUtils';
import {
  ConditionQuestion,
  NameQuestion,
  PriceQuestion,
} from '@apps/going-once/components/things/ThingQuestions';
import {
  EXTRA_ANSWER_KEYS,
  EXTRA_KEYS,
  getRowTitle,
  THING_ROWS,
  type ExtraKey,
} from '@apps/going-once/components/things/thingRows';
import ThingTagCard from '@apps/going-once/components/things/ThingTagCard';
import { CONDITION_LABELS, MAX_ITEM_PHOTOS } from '@apps/going-once/constants';
import { useItemPhotoUrls } from '@apps/going-once/queries/photoUrlQueries';
import {
  addItemPhoto,
  createItem,
  deleteItem,
  removeItemPhoto,
  reorderItemPhotos,
  updateItemFields,
  type ItemFields,
} from '@apps/going-once/store/actions/itemActions';
import { selectItems } from '@apps/going-once/store/selectors';
import type { Item } from '@apps/going-once/types';
import { formatAskingPrice } from '@apps/going-once/utils/listing';
import {
  diffFields,
  EMPTY_ANSWERS,
  EMPTY_FIELDS,
  toAnswers,
  toFields,
  type ThingAnswers,
  type ThingFields,
} from '@apps/going-once/utils/thingAnswers';

interface Answers extends ThingAnswers {
  /** Questions the person chose to answer later. */
  deferred: string[];
  /** The extras already added to the review, in the order they were added. */
  extras: ExtraKey[];
}

const INITIAL_ANSWERS: Answers = {
  ...EMPTY_ANSWERS,
  deferred: [],
  extras: [],
};

const toExtraKey = (key: string): ExtraKey | null =>
  EXTRA_KEYS.find((found) => found === key) ?? null;

const toResumeAnswers = (item: Item): Answers => {
  const answers = toAnswers(item);
  return {
    ...answers,
    deferred: [],
    extras: EXTRA_KEYS.filter((key) => THING_ROWS[key].summary(answers) !== ''),
  };
};

const SAVE_FAILED =
  "That didn't save. Check your connection; what you typed is still here.";

const getPriceBlocker = (answers: Answers) => {
  if (answers.isFree) return null;
  if (answers.price.trim() === '') return "Enter a price, or choose It's free.";
  return 'Enter the price as a dollar amount.';
};

const getListedNote = (photoCount: number, fields: ThingFields) => {
  if (photoCount === 0) return 'Saved · Not listed yet: add a photo';
  if (fields.title === '') return 'Saved · Not listed yet: add a name';
  if (fields.askingPriceCents === null)
    return 'Saved · Not listed yet: add a price';
  return 'Saved · Listed';
};

interface ThingStepsProps {
  saleId: string;
  uid: string;
  /** A thing that was started and left, picked up where it stopped. */
  resume: Item | null;
  onTitleChange: (title: string) => void;
  /** Filled with a function that saves the open answer, for the screen's Back, close and Escape. */
  saveOnExitRef: MutableRefObject<(() => void) | null>;
  onLeave: () => void;
  /** `null` when nothing was written for this thing, so there is nothing to add or take back. */
  onNext: (added: { id: string; name: string } | null) => void;
}

/** One thing's walk-through: it is written from its first answer, and each later answer saves as the person moves on. */
function ThingSteps({
  saleId,
  uid,
  resume,
  onTitleChange,
  saveOnExitRef,
  onLeave,
  onNext,
}: ThingStepsProps) {
  const dispatch = useAppDispatch();
  const [itemId] = useState(() => resume?.id ?? generateUuid());
  const [initialAnswers] = useState(() =>
    resume === null ? INITIAL_ANSWERS : toResumeAnswers(resume),
  );
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const latestAnswers = useRef<Answers>(initialAnswers);
  const [saveError, setSaveError] = useState<string | null>(null);
  const creation = useRef<Promise<void> | null>(
    resume === null ? null : Promise.resolve(),
  );
  const saved = useRef<ThingFields>(
    resume === null ? EMPTY_FIELDS : toFields(initialAnswers),
  );
  const item = useAppSelector(
    (state) =>
      selectItems(state, saleId).find((found) => found.id === itemId) ?? null,
  );
  const photoUrls = useItemPhotoUrls(item?.photos ?? []);
  const [openExtra, setOpenExtra] = useState<ExtraKey | null>(null);

  const set = (patch: Partial<Answers>) => {
    const next = { ...latestAnswers.current, ...patch };
    latestAnswers.current = next;
    setAnswers(next);
    if ('title' in patch) onTitleChange(next.title.trim());
  };

  const ensureCreated = (fields: ItemFields) => {
    creation.current ??= createItem(saleId, itemId, uid, fields).catch(
      (error: unknown) => {
        creation.current = null;
        throw error;
      },
    );
    return creation.current;
  };

  const save = (next: ThingFields) => {
    const changed = diffFields(saved.current, next);
    if (Object.keys(changed).length === 0) return;
    const isFirst = creation.current === null;
    const previous = saved.current;
    saved.current = next;
    const request = isFirst
      ? ensureCreated(changed)
      : updateItemFields(saleId, itemId, uid, changed);
    void request.then(
      () => setSaveError(null),
      () => {
        if (saved.current === next) saved.current = previous;
        setSaveError(SAVE_FAILED);
      },
    );
  };

  // A choice that saves and moves on in one tap runs before React re-renders, so saves read the latest answers.
  const saveAnswers = (overrides: Partial<Answers> = {}) =>
    save(toFields({ ...latestAnswers.current, ...overrides }));

  useEffect(() => {
    saveOnExitRef.current = () => saveAnswers();
  });

  const uploads = usePhotoSetUploads(
    async (file) => {
      await ensureCreated({});
      return dispatch(addItemPhoto({ saleId, itemId, uid, file })).unwrap();
    },
    (item?.photos ?? []).map((photo) => photo.id),
  );

  const photoCount = (item?.photos.length ?? 0) + uploads.uploads.length;
  const fields = toFields(answers);
  const isDeferred = (id: string) => answers.deferred.includes(id);
  const defer = (id: string) =>
    set({ deferred: [...latestAnswers.current.deferred, id] });

  const steps: QuestionStep[] = [
    {
      id: 'photos',
      title: 'Take a few photos',
      summaryLabel: 'Photos',
      summaryValue: '',
      isAnswered: photoCount > 0 || isDeferred('photos'),
      render: () => (
        <div className='space-y-4'>
          <p className='text-muted-foreground text-sm'>
            Different angles help. The first one is the cover.
          </p>
          <PhotoSetPicker
            photos={photoUrls}
            uploads={uploads}
            max={MAX_ITEM_PHOTOS}
            fullMessage={`That's ${MAX_ITEM_PHOTOS}, the most a thing can have.`}
            onReorder={(ids) => reorderItemPhotos(saleId, itemId, uid, ids)}
            onRemove={(photoId) =>
              removeItemPhoto(saleId, itemId, uid, photoId)
            }
          />
        </div>
      ),
    },
    {
      id: 'name',
      title: 'What is it?',
      summaryLabel: 'Name',
      summaryValue: '',
      isAnswered: fields.title !== '' || isDeferred('name'),
      render: () => (
        <NameQuestion
          answers={answers}
          onChange={set}
          onCommit={() => saveAnswers()}
        />
      ),
    },
    {
      id: 'price',
      title: 'What are you asking?',
      summaryLabel: 'Price',
      summaryValue: '',
      isAnswered: fields.askingPriceCents !== null || isDeferred('price'),
      blocker: getPriceBlocker(answers),
      render: () => <PriceQuestion answers={answers} onChange={set} />,
    },
    {
      id: 'condition',
      title: 'What shape is it in?',
      summaryLabel: 'Condition',
      summaryValue: '',
      isAnswered: answers.condition !== null || isDeferred('condition'),
      render: ({ moveOn }) => (
        <ConditionQuestion
          answers={answers}
          onChange={({ condition }) => {
            set({ condition });
            saveAnswers({ condition });
            moveOn();
          }}
        />
      ),
    },
  ];

  const flow = useQuestionFlow({
    steps,
    foldAnswered: resume !== null,
    onAdvance: () => saveAnswers(),
  });
  const isReview = flow.hasReviewed;
  const getNote = () => {
    if (saveError !== null) return saveError;
    if (isReview) return getListedNote(photoCount, fields);
    return flow.blocker ?? (item === null ? null : 'Saved');
  };

  const extraDetails = answers.extras.map((key) => {
    const { label, summary, Question } = THING_ROWS[key];
    const text = summary(answers);
    return {
      key,
      label,
      value:
        text === '' ? 'Add it' : <span className='line-clamp-2'>{text}</span>,
      isEmpty: text === '',
      render: () => <Question answers={answers} onChange={set} />,
    };
  });
  const addExtra = (key: ExtraKey | null) => {
    if (key === null) return;
    set({ extras: [...latestAnswers.current.extras, key] });
    setOpenExtra(key);
  };
  const removeExtra = (key: string) => {
    const extra = toExtraKey(key);
    if (extra === null) return;
    set({
      extras: latestAnswers.current.extras.filter((found) => found !== extra),
      ...Object.fromEntries(
        EXTRA_ANSWER_KEYS[extra].map((name) => [name, EMPTY_ANSWERS[name]]),
      ),
    });
  };

  const openId = flow.open?.id ?? null;
  const canSkip =
    !isReview &&
    openId !== null &&
    flow.open?.isAnswered === false &&
    (openId !== 'photos' || photoCount === 0) &&
    (openId !== 'name' || photoCount > 0);
  const getPriceText = () =>
    formatAskingPrice(fields.askingPriceCents) ??
    (isDeferred('price') ? 'Price later' : '');

  const addAnother = () => {
    saveAnswers();
    onNext(
      creation.current === null
        ? null
        : {
            id: itemId,
            name: fields.title === '' ? 'a thing' : fields.title,
          },
    );
  };

  const getCancelAction = () => {
    if (isReview)
      return (
        <Button
          type='button'
          variant='secondary'
          aria-label='Save and add another'
          onClick={addAnother}
        >
          <Plus className='size-4' aria-hidden='true' />
          <span>
            <span className='max-[359px]:hidden'>Save &amp; add another</span>
            <span className='min-[360px]:hidden'>Add another</span>
          </span>
        </Button>
      );
    if (openId === null) return undefined;
    // Held in place while it can't be used, so Next never jumps when the first answer is typed.
    return (
      <Button
        type='button'
        variant='tertiary'
        className={canSkip ? undefined : 'invisible'}
        aria-hidden={!canSkip}
        tabIndex={canSkip ? undefined : -1}
        onClick={() => {
          defer(openId);
          flow.moveOnFrom(openId);
        }}
      >
        Skip for now
      </Button>
    );
  };

  const leave = () => {
    saveAnswers();
    onLeave();
  };

  return (
    <>
      <div className='space-y-5'>
        <QuestionFlow
          flow={flow}
          renderAnswered={(answered, reopen) => (
            <ThingTagCard
              coverUrl={photoUrls[0]?.url ?? null}
              photoCount={photoCount}
              title={fields.title}
              priceText={getPriceText()}
              conditionLabel={
                answers.condition === null
                  ? ''
                  : CONDITION_LABELS[answers.condition]
              }
              floorText={
                fields.floorPriceCents === null
                  ? ''
                  : formatCentsShort(fields.floorPriceCents)
              }
              isFloorAbove={
                fields.floorPriceCents !== null &&
                fields.askingPriceCents !== null &&
                fields.floorPriceCents > fields.askingPriceCents
              }
              deferred={answers.deferred}
              answered={answered.map((step) => step.id)}
              onReopen={reopen}
            />
          )}
        />
        {isReview && (
          <>
            <OptionalDetailRows
              heading='More about it'
              details={extraDetails}
              openKey={openExtra}
              onOpen={(key) => setOpenExtra(toExtraKey(key))}
              onClose={() => {
                setOpenExtra(null);
                saveAnswers();
              }}
              onRemove={removeExtra}
            />
            <AddFieldChips
              heading='Add more details'
              chips={EXTRA_KEYS.filter(
                (key) => !answers.extras.includes(key),
              ).map((key) => ({
                key,
                label: getRowTitle(key),
                icon: THING_ROWS[key].label.startsWith('🔒')
                  ? '🔒'
                  : THING_ROWS[key].icon,
              }))}
              onAdd={(key) => addExtra(toExtraKey(key))}
            />
          </>
        )}
        <ModalFooterActions
          note={getNote()}
          cancelAction={getCancelAction()}
          rightActions={
            isReview ? (
              <Button type='button' onClick={leave}>
                Save
              </Button>
            ) : (
              <Button
                type='button'
                className='max-sm:-ml-2'
                disabled={!flow.open?.isAnswered}
                onClick={flow.advance}
              >
                Next
              </Button>
            )
          }
        />
      </div>
    </>
  );
}

interface NewThingFlowProps {
  saleId: string;
  uid: string;
  /** A thing that was started and left Not listed yet, to pick up where it stopped. */
  resume?: Item | null;
  onClose: () => void;
}

/** Adds things one after another: photos, a name, a price (or Free) with a floor beside it, a condition, then the next thing. Back, close and Escape save the open answer first. */
function NewThingFlow({
  saleId,
  uid,
  resume = null,
  onClose,
}: NewThingFlowProps) {
  const [added, setAdded] = useState<{ id: string; name: string }[]>([]);
  const [sittingStep, setSittingStep] = useState(0);
  const [title, setTitle] = useState(resume?.title.trim() ?? '');
  const saveOnExit = useRef<(() => void) | null>(null);
  const { addToast } = useToast();
  const { pending, showUndo, undo } = useUndoRemoval();
  const items = useAppSelector((state) => selectItems(state, saleId));
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  });
  const close = () => {
    saveOnExit.current?.();
    onClose();
  };

  const takeBack = (thing: { id: string; name: string }) => {
    setAdded((current) => current.filter((found) => found.id !== thing.id));
    const item = itemsRef.current.find((found) => found.id === thing.id);
    if (item === undefined) return;
    deleteItem(saleId, item, () =>
      addToast({
        title: `${thing.name} couldn't be taken back`,
        description: 'Delete it from the Things tab instead.',
        type: 'error',
      }),
    );
  };

  const addedText =
    added.length === 0
      ? ''
      : `Added ${added[added.length - 1].name}${added.length > 1 ? ` · ${added.length} things added this sitting` : ''}`;
  const statusLine =
    added.length === 0 ? null : (
      <div
        className={join(
          'mt-1.5 mb-3 flex items-center gap-3 rounded-2xl text-sm',
          pending
            ? 'bg-foreground text-background py-2 pr-2 pl-3'
            : 'text-muted-foreground',
        )}
      >
        <span
          aria-hidden='true'
          className='bg-primary text-primary-foreground flex size-5 shrink-0 items-center justify-center rounded-full'
        >
          <Check className='size-3' />
        </span>
        <p role='status' className='line-clamp-2 min-w-0 flex-1 break-words'>
          {addedText}
        </p>
        {pending && (
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            aria-label={`Undo, ${pending.secondsLeft} seconds left`}
            className='text-background! bg-background/15 hover:bg-background/25 h-10 shrink-0 rounded-xl! px-3! font-semibold whitespace-nowrap tabular-nums'
            onClick={undo}
          >
            Undo · {pending.secondsLeft}
          </Button>
        )}
      </div>
    );

  return (
    <Subview
      overlay
      title={title === '' ? 'New thing' : title}
      onClose={close}
      isTitleWrapped
    >
      {statusLine}
      <ThingSteps
        key={sittingStep}
        saleId={saleId}
        uid={uid}
        resume={sittingStep === 0 ? resume : null}
        onTitleChange={setTitle}
        saveOnExitRef={saveOnExit}
        onLeave={onClose}
        onNext={(thing) => {
          setSittingStep((current) => current + 1);
          setTitle('');
          if (thing === null) return;
          setAdded((current) => [...current, thing]);
          if (thing.id !== resume?.id)
            showUndo(`Added ${thing.name}`, () => takeBack(thing));
        }}
      />
    </Subview>
  );
}

export default NewThingFlow;
