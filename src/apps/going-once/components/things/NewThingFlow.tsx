import { useEffect, useRef, useState, type MutableRefObject } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';

import AmountHero from '@/components/AmountHero';
import PhotoSetPicker from '@/components/forms/PhotoSetPicker';
import ModalFooterActions from '@/components/ModalFooterActions';
import MoneyInput from '@/components/MoneyInput';
import { PillGroup } from '@/components/PillGroup';
import QuestionFlow from '@/components/QuestionFlow';
import RevealChip from '@/components/RevealChip';
import Subview from '@/components/Subview';
import { usePhotoSetUploads } from '@/hooks/usePhotoSetUploads';
import { useQuestionFlow, type QuestionStep } from '@/hooks/useQuestionFlow';
import { useAppDispatch, useAppSelector } from '@/store';
import { generateUuid } from '@/utils';
import {
  centsToInputValue,
  formatCentsShort,
  parseMoneyToCents,
} from '@/utils/moneyUtils';
import {
  CONDITION_LABELS,
  CONDITION_OPTIONS,
  MAX_ITEM_PHOTOS,
  MAX_ITEM_TITLE_LENGTH,
} from '@apps/going-once/constants';
import { useItemPhotoUrls } from '@apps/going-once/queries/photoUrlQueries';
import {
  addItemPhoto,
  createItem,
  removeItemPhoto,
  reorderItemPhotos,
  updateItemFields,
  type ItemFields,
} from '@apps/going-once/store/actions/itemActions';
import { selectItems } from '@apps/going-once/store/selectors';
import type { Item, ItemCondition } from '@apps/going-once/types';

interface Answers {
  title: string;
  price: string;
  isFree: boolean;
  floor: string;
  isFloorShown: boolean;
  condition: ItemCondition | null;
  /** Questions the person chose to answer later. */
  deferred: string[];
}

const INITIAL_ANSWERS: Answers = {
  title: '',
  price: '',
  isFree: false,
  floor: '',
  isFloorShown: false,
  condition: null,
  deferred: [],
};

const EMPTY_FIELDS: Required<ItemFields> = {
  title: '',
  condition: null,
  askingPriceCents: null,
  floorPriceCents: null,
};

const toFields = (answers: Answers): Required<ItemFields> => ({
  title: answers.title.trim(),
  condition: answers.condition,
  askingPriceCents: answers.isFree ? 0 : parseMoneyToCents(answers.price),
  floorPriceCents:
    answers.isFree || !answers.isFloorShown
      ? null
      : parseMoneyToCents(answers.floor),
});

const toAnswers = (item: Item): Answers => ({
  title: item.title,
  price:
    item.askingPriceCents === null || item.askingPriceCents === 0
      ? ''
      : centsToInputValue(item.askingPriceCents),
  isFree: item.askingPriceCents === 0,
  floor: centsToInputValue(item.floorPriceCents),
  isFloorShown: item.floorPriceCents !== null,
  condition: item.condition,
  deferred: [],
});

const SAVE_FAILED =
  "That didn't save. Check your connection; what you typed is still here.";

const getListedNote = (photoCount: number, fields: Required<ItemFields>) => {
  if (photoCount === 0) return 'Saved · Not listed yet: add a photo';
  if (fields.title === '') return 'Saved · Not listed yet: add a name';
  if (fields.askingPriceCents === null)
    return 'Saved · Not listed yet: add a price';
  return 'Saved · Listed';
};

interface ThingFormProps {
  saleId: string;
  uid: string;
  /** Said under the title after a first thing, in the same sitting. */
  statusLine: string | null;
  /** A thing that was started and left, picked up where it stopped. */
  resume: Item | null;
  onTitleChange: (title: string) => void;
  /** Filled with a function that saves the open answer, for the screen's Back, close and Escape. */
  saveOnExitRef: MutableRefObject<(() => void) | null>;
  onLeave: () => void;
  onNext: (addedName: string) => void;
}

/** One thing's walk-through: it is written from its first answer, and each later answer saves as the person moves on. */
function ThingForm({
  saleId,
  uid,
  statusLine,
  resume,
  onTitleChange,
  saveOnExitRef,
  onLeave,
  onNext,
}: ThingFormProps) {
  const dispatch = useAppDispatch();
  const [itemId] = useState(() => resume?.id ?? generateUuid());
  const [initialAnswers] = useState(() =>
    resume === null ? INITIAL_ANSWERS : toAnswers(resume),
  );
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const latestAnswers = useRef<Answers>(initialAnswers);
  const [saveError, setSaveError] = useState<string | null>(null);
  const creation = useRef<Promise<void> | null>(
    resume === null ? null : Promise.resolve(),
  );
  const saved = useRef<Required<ItemFields>>(
    resume === null ? EMPTY_FIELDS : toFields(initialAnswers),
  );
  const item = useAppSelector(
    (state) =>
      selectItems(state, saleId).find((found) => found.id === itemId) ?? null,
  );
  const photoUrls = useItemPhotoUrls(item?.photos ?? []);

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

  const save = (next: Required<ItemFields>) => {
    const changed = Object.fromEntries(
      Object.entries(next).filter(
        ([key, value]) => saved.current[key as keyof ItemFields] !== value,
      ),
    ) as ItemFields;
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
  const decideLater = (id: string, moveOn: () => void) => (
    <div className='flex justify-center'>
      <RevealChip
        onClick={() => {
          defer(id);
          moveOn();
        }}
      >
        Decide later
      </RevealChip>
    </div>
  );
  const isFloorAbove =
    fields.floorPriceCents !== null &&
    fields.askingPriceCents !== null &&
    fields.floorPriceCents > fields.askingPriceCents;
  const priceSummary = [
    fields.askingPriceCents === null
      ? ''
      : fields.askingPriceCents === 0
        ? 'Free'
        : formatCentsShort(fields.askingPriceCents),
    fields.floorPriceCents === null
      ? ''
      : `🔒 floor ${formatCentsShort(fields.floorPriceCents)}`,
  ]
    .filter((part) => part !== '')
    .join(' · ');

  const steps: QuestionStep[] = [
    {
      id: 'photos',
      title: 'Take a few photos',
      summaryLabel: 'Photos',
      summaryValue:
        photoCount > 0
          ? `${photoCount} ${photoCount === 1 ? 'photo' : 'photos'}`
          : isDeferred('photos')
            ? 'Skipped for now'
            : '',
      isAnswered: photoCount > 0 || isDeferred('photos'),
      render: ({ moveOn }) => (
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
          {photoCount === 0 && (
            <div className='flex justify-center'>
              <RevealChip
                onClick={() => {
                  defer('photos');
                  moveOn();
                }}
              >
                Skip photos for now
              </RevealChip>
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'name',
      title: 'What is it?',
      summaryLabel: 'Name',
      summaryValue: fields.title || (isDeferred('name') ? 'Decide later' : ''),
      isAnswered: fields.title !== '' || isDeferred('name'),
      render: ({ moveOn }) => (
        <div className='space-y-4'>
          <Input
            variant='outline'
            aria-label='Name'
            placeholder='Oak desk'
            maxLength={MAX_ITEM_TITLE_LENGTH}
            value={answers.title}
            onChange={(event) => set({ title: event.target.value })}
            onBlur={() => saveAnswers()}
          />
          {photoCount > 0 && decideLater('name', moveOn)}
        </div>
      ),
    },
    {
      id: 'price',
      title: 'What are you asking?',
      summaryLabel: 'Price',
      summaryValue: priceSummary || (isDeferred('price') ? 'Decide later' : ''),
      isAnswered: fields.askingPriceCents !== null || isDeferred('price'),
      blocker: answers.isFree
        ? null
        : answers.price.trim() === ''
          ? "Enter a price, or tap It's free."
          : 'Enter the price as a dollar amount.',
      render: ({ moveOn }) => (
        <div className='space-y-4'>
          {answers.isFree ? (
            <div className='space-y-3 text-center'>
              <p className='text-5xl font-semibold'>Free</p>
              <RevealChip onClick={() => set({ isFree: false })}>
                Set a price
              </RevealChip>
            </div>
          ) : (
            <AmountHero
              label='Asking price'
              value={answers.price}
              onChange={(price) => set({ price })}
              autoFocus
              ways={[
                {
                  label: "It's free",
                  onClick: () => set({ isFree: true, isFloorShown: false }),
                },
              ]}
            />
          )}
          {!answers.isFree &&
            (answers.isFloorShown ? (
              <div className='space-y-1'>
                <p className='text-sm font-medium'>🔒 Floor price</p>
                <MoneyInput
                  ariaLabel='Floor price'
                  value={answers.floor}
                  onChange={(floor) => set({ floor })}
                  autoFocus
                  wrapperClassName='max-w-48'
                />
                <p className='text-muted-foreground text-xs'>
                  Only you and your co-sellers see this. Buyers never do.
                </p>
              </div>
            ) : (
              <div className='flex justify-center'>
                <RevealChip
                  icon='+'
                  onClick={() => set({ isFloorShown: true })}
                >
                  🔒 Floor price
                </RevealChip>
              </div>
            ))}
          {!answers.isFree && decideLater('price', moveOn)}
        </div>
      ),
    },
    {
      id: 'condition',
      title: 'What shape is it in?',
      summaryLabel: 'Condition',
      summaryValue:
        answers.condition === null
          ? isDeferred('condition')
            ? 'Decide later'
            : ''
          : CONDITION_LABELS[answers.condition],
      isAnswered: answers.condition !== null || isDeferred('condition'),
      render: ({ moveOn }) => (
        <div className='space-y-4'>
          <PillGroup
            label='Condition'
            options={CONDITION_OPTIONS}
            value={answers.condition}
            onChange={(condition) => {
              set({ condition });
              saveAnswers({ condition });
              moveOn();
            }}
          />
          {answers.condition === null && decideLater('condition', moveOn)}
        </div>
      ),
    },
  ];

  const flow = useQuestionFlow({
    steps,
    foldAnswered: resume !== null,
    onAdvance: () => saveAnswers(),
  });
  const isReview = flow.hasReviewed;
  const floorNote = isFloorAbove ? 'Floor is above the asking price' : null;
  const getNote = () => {
    if (saveError !== null) return saveError;
    if (isReview)
      return [getListedNote(photoCount, fields), floorNote]
        .filter((part) => part !== null)
        .join(' · ');
    return floorNote ?? flow.blocker ?? (item === null ? null : 'Saved');
  };

  const leave = () => {
    saveAnswers();
    onLeave();
  };

  return (
    <>
      {statusLine && (
        <p className='text-muted-foreground -mt-1 mb-3 text-sm' role='status'>
          {statusLine}
        </p>
      )}
      <div className='space-y-5'>
        <QuestionFlow flow={flow} />
        <ModalFooterActions
          note={getNote()}
          cancelAction={
            isReview ? (
              <Button type='button' variant='secondary' onClick={leave}>
                Done
              </Button>
            ) : undefined
          }
          rightActions={
            isReview ? (
              <Button
                type='button'
                onClick={() => {
                  saveAnswers();
                  onNext(fields.title === '' ? 'a thing' : fields.title);
                }}
              >
                Next thing
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
  const [added, setAdded] = useState<string[]>([]);
  const [title, setTitle] = useState(resume?.title.trim() ?? '');
  const saveOnExit = useRef<(() => void) | null>(null);
  const close = () => {
    saveOnExit.current?.();
    onClose();
  };
  const lastAdded = added.at(-1) ?? null;

  const statusLine =
    lastAdded === null
      ? null
      : `Added ${lastAdded}${added.length > 1 ? ` · ${added.length} things added this sitting` : ''}`;

  return (
    <Subview
      overlay
      title={title === '' ? 'New thing' : title}
      onClose={close}
      isTitleWrapped
    >
      <ThingForm
        key={added.length}
        saleId={saleId}
        uid={uid}
        statusLine={statusLine}
        resume={added.length === 0 ? resume : null}
        onTitleChange={setTitle}
        saveOnExitRef={saveOnExit}
        onLeave={onClose}
        onNext={(name) => {
          setAdded((current) => [...current, name]);
          setTitle('');
        }}
      />
    </Subview>
  );
}

export default NewThingFlow;
