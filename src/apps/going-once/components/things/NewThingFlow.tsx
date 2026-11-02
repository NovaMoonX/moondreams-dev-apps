import { useRef, useState } from 'react';

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
import { formatCentsShort, parseMoneyToCents } from '@/utils/moneyUtils';
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
import type { ItemCondition } from '@apps/going-once/types';

interface Answers {
  title: string;
  price: string;
  isFree: boolean;
  floor: string;
  isFloorShown: boolean;
  condition: ItemCondition | null;
  hasSkippedPhotos: boolean;
}

const INITIAL_ANSWERS: Answers = {
  title: '',
  price: '',
  isFree: false,
  floor: '',
  isFloorShown: false,
  condition: null,
  hasSkippedPhotos: false,
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
  onTitleChange: (title: string) => void;
  onLeave: () => void;
  onNext: (addedName: string) => void;
}

/** One thing's walk-through: it is written from its first answer, and each later answer saves as the person moves on. */
function ThingForm({
  saleId,
  uid,
  statusLine,
  onTitleChange,
  onLeave,
  onNext,
}: ThingFormProps) {
  const dispatch = useAppDispatch();
  const [itemId] = useState(generateUuid);
  const [answers, setAnswers] = useState<Answers>(INITIAL_ANSWERS);
  const latestAnswers = useRef<Answers>(INITIAL_ANSWERS);
  const [saveError, setSaveError] = useState<string | null>(null);
  const creation = useRef<Promise<void> | null>(null);
  const saved = useRef<Required<ItemFields>>(EMPTY_FIELDS);
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
    creation.current ??= createItem(saleId, itemId, uid, fields);
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
    saved.current = next;
    const request = isFirst
      ? ensureCreated(changed)
      : updateItemFields(saleId, itemId, uid, changed);
    void request.then(
      () => setSaveError(null),
      () => setSaveError(SAVE_FAILED),
    );
  };

  // A choice that saves and moves on in one tap runs before React re-renders, so saves read the latest answers.
  const saveAnswers = (overrides: Partial<Answers> = {}) =>
    save(toFields({ ...latestAnswers.current, ...overrides }));

  const uploads = usePhotoSetUploads(async (file) => {
    await ensureCreated({});
    await dispatch(addItemPhoto({ saleId, itemId, uid, file })).unwrap();
  });

  const photoCount = (item?.photos.length ?? 0) + uploads.uploads.length;
  const fields = toFields(answers);
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
          : answers.hasSkippedPhotos
            ? 'Skipped for now'
            : '',
      isAnswered: photoCount > 0 || answers.hasSkippedPhotos,
      render: ({ moveOn }) => (
        <div className='space-y-4'>
          <p className='text-muted-foreground text-sm'>
            Different angles help. The first one is the cover.
          </p>
          <PhotoSetPicker
            photos={photoUrls}
            uploads={uploads}
            max={MAX_ITEM_PHOTOS}
            onReorder={(ids) => reorderItemPhotos(saleId, itemId, uid, ids)}
            onRemove={(photoId) =>
              removeItemPhoto(saleId, itemId, uid, photoId)
            }
          />
          {photoCount === 0 && (
            <Button
              type='button'
              variant='tertiary'
              rounded='full'
              className='text-muted-foreground!'
              onClick={() => {
                set({ hasSkippedPhotos: true });
                moveOn();
              }}
            >
              Skip photos for now
            </Button>
          )}
        </div>
      ),
    },
    {
      id: 'name',
      title: 'What is it?',
      summaryLabel: 'Name',
      summaryValue: fields.title,
      isAnswered: fields.title !== '',
      render: () => (
        <Input
          variant='outline'
          aria-label='Name'
          placeholder='Oak desk'
          maxLength={MAX_ITEM_TITLE_LENGTH}
          value={answers.title}
          onChange={(event) => set({ title: event.target.value })}
          onBlur={() => saveAnswers()}
        />
      ),
    },
    {
      id: 'price',
      title: 'What are you asking?',
      summaryLabel: 'Price',
      summaryValue: priceSummary,
      isAnswered: fields.askingPriceCents !== null,
      blocker:
        answers.price.trim() === '' || answers.isFree
          ? null
          : 'Enter the price as a dollar amount.',
      render: () => (
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
        </div>
      ),
    },
    {
      id: 'condition',
      title: 'What shape is it in?',
      summaryLabel: 'Condition',
      summaryValue:
        answers.condition === null ? '' : CONDITION_LABELS[answers.condition],
      isAnswered: answers.condition !== null,
      render: ({ moveOn }) => (
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
      ),
    },
  ];

  const flow = useQuestionFlow({
    steps,
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
  onClose: () => void;
}

/** Adds things one after another: photos, a name, a price (or Free) with a floor beside it, a condition, then the next thing. */
function NewThingFlow({ saleId, uid, onClose }: NewThingFlowProps) {
  const [added, setAdded] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const lastAdded = added.at(-1) ?? null;

  const statusLine =
    lastAdded === null
      ? null
      : `Added ${lastAdded}${added.length > 1 ? ` · ${added.length} things added this sitting` : ''}`;

  return (
    <Subview
      overlay
      title={title === '' ? 'New thing' : title}
      onClose={onClose}
      isTitleWrapped
    >
      <ThingForm
        key={added.length}
        saleId={saleId}
        uid={uid}
        statusLine={statusLine}
        onTitleChange={setTitle}
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
