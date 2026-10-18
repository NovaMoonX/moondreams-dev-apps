import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  Hash,
  History,
  PencilLine,
  Undo2,
} from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import DeleteIconButton from '@/components/DeleteIconButton';
import FormSection from '@/components/FormSection';
import FormSheet from '@/components/FormSheet';
import GroupRow from '@/components/GroupRow';
import ModalFooterActions from '@/components/ModalFooterActions';
import Stepper from '@/components/Stepper';
import { useBackStep } from '@/hooks/useBackHistory';
import { useAppSelector } from '@/store';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateShort, formatTime } from '@/utils/formatUtils';
import EatByBadge from '@apps/pinch/components/containers/EatByBadge';
import EatByField from '@apps/pinch/components/containers/EatByField';
import {
  CONTAINER_PLACE_EMOJIS,
  CONTAINER_PLACE_LABELS,
  MAX_CONTAINER_SERVINGS,
} from '@apps/pinch/constants';
import { useContainerActions } from '@apps/pinch/hooks/useContainerActions';
import {
  selectContainersById,
  selectMealsById,
  selectRecipesById,
  selectUsualDays,
} from '@apps/pinch/store/selectors';
import type { Container, ContainerPlace } from '@apps/pinch/types';
import {
  canPutBack,
  getBatchKey,
  getBatchServingsText,
  getBoxCountCopy,
  getContainerTitle,
  getCountChangeCopy,
  getEatByDefault,
  getEatByHint,
  getEatByLabel,
  getEatByPhrase,
  getEatByState,
  getEventText,
  getFinishedText,
  getFreezeLine,
  getFrozenText,
  getLastPlaceEvent,
  getMoveForPlace,
  getMoveNotes,
  groupBatches,
  isValidEatBy,
} from '@apps/pinch/utils/containers';
import { getRecipeCare } from '@apps/pinch/utils/recipeCare';
import { formatServings } from '@apps/pinch/utils/recipeFormat';

type SheetView =
  | { kind: 'details' }
  | { kind: 'gone' }
  | { kind: 'move'; to: ContainerPlace }
  | { kind: 'eatBy' }
  | { kind: 'count' }
  | { kind: 'history' }
  | { kind: 'boxes' };

interface BackLinkProps {
  onClick: () => void;
  label?: string;
}

function BackLink({ onClick, label = 'Back' }: BackLinkProps) {
  useBackStep(true, onClick);

  return (
    <Button
      type='button'
      variant='tertiary'
      className='h-10 gap-1 justify-self-start px-0!'
      onClick={onClick}
    >
      <ChevronLeft className='h-4 w-4' aria-hidden='true' />
      {label}
    </Button>
  );
}

interface ErrorLineProps {
  error: string | null;
}

function ErrorLine({ error }: ErrorLineProps) {
  if (error === null) return null;

  return (
    <p className='text-destructive text-sm' role='alert'>
      {error}
    </p>
  );
}

interface GoneViewProps {
  isBatch: boolean;
  onAnswer: (answer: 'EAT' | 'TOSS') => Promise<unknown>;
  onBack: () => void;
  onDone: () => void;
}

function GoneView({ isBatch, onAnswer, onBack, onDone }: GoneViewProps) {
  const [busy, setBusy] = useState<'EAT' | 'TOSS' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handle = async (answer: 'EAT' | 'TOSS') => {
    if (busy !== null) return;

    setError(null);
    setBusy(answer);
    try {
      if ((await onAnswer(answer)) !== undefined) onDone();
    } catch (endError) {
      setError(getErrorMessage(endError, 'Unable to save this.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className='grid gap-4'>
      <BackLink onClick={onBack} />
      <p className='font-medium'>
        {isBatch ? 'What happened to them?' : 'What happened to it?'}
      </p>
      <div className='grid grid-cols-2 gap-3'>
        <Button
          type='button'
          variant='secondary'
          className='h-12'
          loading={busy === 'EAT'}
          disabled={busy !== null}
          onClick={() => void handle('EAT')}
        >
          {isBatch ? 'Ate them' : 'Ate it'}
        </Button>
        <Button
          type='button'
          variant='secondary'
          className='h-12'
          loading={busy === 'TOSS'}
          disabled={busy !== null}
          onClick={() => void handle('TOSS')}
        >
          Tossed
        </Button>
      </div>
      <ErrorLine error={error} />
    </div>
  );
}

interface MoveViewProps {
  uid: string;
  container: Container;
  to: ContainerPlace;
  isOneOfBatch: boolean;
  onBack: () => void;
  onDone: () => void;
}

function MoveView({
  uid,
  container,
  to,
  isOneOfBatch,
  onBack,
  onDone,
}: MoveViewProps) {
  const { move: moveContainer } = useContainerActions(uid);
  const recipe = useAppSelector(selectRecipesById).get(
    container.recipeId ?? '',
  );
  const move = getMoveForPlace(to, container.place);
  const usualDays = useAppSelector(selectUsualDays);
  const preset = getEatByDefault(
    move,
    recipe ? getRecipeCare(recipe) : null,
    undefined,
    container.eatBy,
    usualDays,
  );
  const notes = getMoveNotes(container, move, preset);
  const [typedEatBy, setTypedEatBy] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eatByText = typedEatBy ?? toDateInputValue(preset.eatBy);
  const eatBy = fromDateInputValue(eatByText) ?? null;
  const isValid = eatBy !== null && isValidEatBy(eatBy);
  const label = to === 'FREEZER' ? 'Put in the freezer' : 'Thaw in the fridge';
  const placeWord = to === 'FREEZER' ? 'freezer' : 'fridge';

  const handleMove = async () => {
    if (!isValid || isSaving) return;

    setError(null);
    setIsSaving(true);
    try {
      if ((await moveContainer(container, to, eatBy)) !== undefined) {
        onDone();
        return;
      }
      setIsSaving(false);
    } catch (moveError) {
      setError(getErrorMessage(moveError, 'Unable to save this.'));
      setIsSaving(false);
    }
  };

  return (
    <div className='grid gap-4'>
      <BackLink onClick={onBack} />
      <div className='space-y-1'>
        <p className='font-medium'>{label}</p>
        <p className='text-muted-foreground text-sm'>
          {isOneOfBatch
            ? `One box goes in the ${placeWord}; the others stay where they are.`
            : `The whole box goes in the ${placeWord}.`}
        </p>
      </div>
      {notes.length > 0 && (
        <p className='text-muted-foreground text-sm'>{notes.join(' ')}</p>
      )}
      <EatByField
        value={eatByText}
        onChange={setTypedEatBy}
        hint={getEatByHint(move, preset)}
      />
      <ErrorLine error={error} />
      <ModalFooterActions
        cancelAction={
          <Button
            type='button'
            variant='secondary'
            onClick={onBack}
            disabled={isSaving}
          >
            Cancel
          </Button>
        }
        rightActions={
          <Button
            type='button'
            loading={isSaving}
            disabled={isSaving || !isValid}
            onClick={() => void handleMove()}
          >
            {label}
          </Button>
        }
      />
    </div>
  );
}

interface EatByViewProps {
  eatBy: number;
  onSave: (eatBy: number) => Promise<unknown>;
  onBack: () => void;
}

function EatByView({ eatBy: current, onSave, onBack }: EatByViewProps) {
  const [typedEatBy, setTypedEatBy] = useState(toDateInputValue(current));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eatBy = fromDateInputValue(typedEatBy) ?? null;
  const canSave = eatBy !== null && isValidEatBy(eatBy) && eatBy !== current;

  const handleSave = async () => {
    if (!canSave || isSaving) return;

    setError(null);
    setIsSaving(true);
    try {
      await onSave(eatBy);
      onBack();
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save this.'));
      setIsSaving(false);
    }
  };

  return (
    <div className='grid gap-4'>
      <BackLink onClick={onBack} />
      <p className='font-medium'>Change the eat-by date</p>
      <EatByField
        value={typedEatBy}
        onChange={setTypedEatBy}
        hint='Your call. Pick the last day you mean to eat it.'
      />
      <ErrorLine error={error} />
      <ModalFooterActions
        cancelAction={
          <Button
            type='button'
            variant='secondary'
            onClick={onBack}
            disabled={isSaving}
          >
            Cancel
          </Button>
        }
        rightActions={
          <Button
            type='button'
            loading={isSaving}
            disabled={isSaving || !canSave}
            onClick={() => void handleSave()}
          >
            Save
          </Button>
        }
      />
    </div>
  );
}

interface CountViewProps {
  uid: string;
  container: Container;
  onBack: () => void;
  onDone: () => void;
}

function CountView({ uid, container, onBack, onDone }: CountViewProps) {
  const { eat, correctCount } = useContainerActions(uid);
  const [count, setCount] = useState(container.servings);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { change, line, action } = getCountChangeCopy(
    container.servings,
    count,
  );

  const save = async () => {
    if (change.kind === 'SAME') return;
    if (change.kind === 'COUNT') {
      await correctCount(container, change.count);
      onBack();
      return;
    }
    const eaten = await eat(
      container,
      change.kind === 'ALL' ? 'ALL' : change.eaten,
    );
    if (eaten !== undefined) onDone();
  };

  const handleSave = async () => {
    if (change.kind === 'SAME' || isSaving) return;

    setError(null);
    setIsSaving(true);
    try {
      await save();
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save this.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className='grid gap-4'>
      <BackLink onClick={onBack} />
      <p className='font-medium'>How many are left?</p>
      <Stepper
        value={count}
        onChange={setCount}
        label='Servings left'
        min={0}
        max={MAX_CONTAINER_SERVINGS}
        step={1}
      />
      <p className='text-muted-foreground text-sm' role='status'>
        {line}
      </p>
      <ErrorLine error={error} />
      <ModalFooterActions
        cancelAction={
          <Button
            type='button'
            variant='secondary'
            onClick={onBack}
            disabled={isSaving}
          >
            Cancel
          </Button>
        }
        rightActions={
          <Button
            type='button'
            loading={isSaving}
            disabled={isSaving || change.kind === 'SAME'}
            onClick={() => void handleSave()}
          >
            {action}
          </Button>
        }
      />
    </div>
  );
}

interface BoxCountViewProps {
  boxes: Container[];
  onEat: (eaten: Container[], left: number) => Promise<unknown>;
  onBack: () => void;
  onDone: () => void;
}

function BoxCountView({ boxes, onEat, onBack, onDone }: BoxCountViewProps) {
  const [count, setCount] = useState(boxes.length);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { eaten, line, action } = getBoxCountCopy(boxes.length, count);

  const handleSave = async () => {
    if (eaten === 0 || isSaving) return;

    setError(null);
    setIsSaving(true);
    try {
      if ((await onEat(boxes.slice(0, eaten), count)) !== undefined) {
        onDone();
      }
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save this.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className='grid gap-4'>
      <BackLink onClick={onBack} />
      <p className='font-medium'>How many boxes are left?</p>
      <Stepper
        value={count}
        onChange={setCount}
        label='Boxes left'
        min={0}
        max={boxes.length}
        step={1}
      />
      <p className='text-muted-foreground text-sm' role='status'>
        {line}
      </p>
      <ErrorLine error={error} />
      <ModalFooterActions
        cancelAction={
          <Button
            type='button'
            variant='secondary'
            onClick={onBack}
            disabled={isSaving}
          >
            Cancel
          </Button>
        }
        rightActions={
          <Button
            type='button'
            loading={isSaving}
            disabled={isSaving || eaten === 0}
            onClick={() => void handleSave()}
          >
            {action}
          </Button>
        }
      />
    </div>
  );
}

interface HistoryListProps {
  container: Container;
}

function HistoryList({ container }: HistoryListProps) {
  return (
    <FormSection title='History'>
      <ul className='divide-border divide-y'>
        {[...container.history].reverse().map((event, index) => (
          <li key={`${event.at}-${index}`} className='py-2'>
            <p className='text-sm wrap-break-word'>{getEventText(event)}</p>
            <p className='text-muted-foreground text-xs'>
              {formatDateShort(event.at)} · {formatTime(event.at)}
            </p>
          </li>
        ))}
      </ul>
    </FormSection>
  );
}

interface FactsProps {
  container: Container;
  servingsText: string;
  onChangeDate: () => void;
}

function Facts({ container, servingsText, onChangeDate }: FactsProps) {
  const state = getEatByState(container.eatBy);
  const dateLabel =
    state === 'PAST'
      ? `Past its date · ${getEatByPhrase(container.eatBy)}`
      : getEatByLabel(container.eatBy);
  const freezeLine = getFreezeLine(container.history);
  const lastPlace = getLastPlaceEvent(container.history);
  const thawedAt = lastPlace?.kind === 'THAW' ? lastPlace.at : null;

  return (
    <div className='space-y-1.5'>
      <p className='text-muted-foreground flex flex-wrap gap-x-3 text-sm'>
        <span className='whitespace-nowrap'>
          <span aria-hidden='true'>
            {CONTAINER_PLACE_EMOJIS[container.place]}
          </span>{' '}
          {CONTAINER_PLACE_LABELS[container.place]}
        </span>
        <span className='whitespace-nowrap'>{servingsText}</span>
        {container.place === 'FREEZER' && (
          <span className='whitespace-nowrap'>{getFrozenText(container)}</span>
        )}
      </p>
      <Button
        type='button'
        variant='tertiary'
        aria-label={`${dateLabel}. Change the date`}
        className="text-foreground! relative h-auto min-h-0 flex-wrap justify-start gap-x-2 gap-y-1 px-0! py-0! text-left text-sm font-normal before:absolute before:inset-x-0 before:-inset-y-2.5 before:content-['']"
        onClick={onChangeDate}
      >
        {state === 'LATER' ? (
          <span className='whitespace-nowrap'>{dateLabel}</span>
        ) : (
          <EatByBadge state={state} label={dateLabel} />
        )}
        <PencilLine
          className='text-muted-foreground h-3.5 w-3.5 shrink-0'
          aria-hidden='true'
        />
      </Button>
      {(freezeLine || thawedAt !== null) && (
        <p className='text-muted-foreground text-sm'>
          {[
            thawedAt !== null
              ? `Thawed in the fridge on ${formatDateShort(thawedAt)}`
              : null,
            freezeLine,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
    </div>
  );
}

interface ContainerSheetProps {
  uid: string;
  /** The boxes one row stands for: a batch put away together, or a single box. */
  containerIds: string[];
  /** The batch the row showed; boxes that leave it (moved or re-dated alone) drop out of the sheet. */
  batchKey: string | null;
  /** Finished containers are not in the live store. */
  finished: Container | null;
  onClose: () => void;
}

function ContainerSheet({
  uid,
  containerIds,
  batchKey,
  finished,
  onClose,
}: ContainerSheetProps) {
  const { confirm } = useActionModal();
  const {
    eat,
    toss,
    changeEatBy,
    remove,
    putBack,
    endBatch,
    changeBatchEatBy,
    removeBatch,
  } = useContainerActions(uid);
  const containersById = useAppSelector(selectContainersById);
  const recipesById = useAppSelector(selectRecipesById);
  const mealsById = useAppSelector(selectMealsById);
  const [view, setView] = useState<SheetView>({ kind: 'details' });
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const live = containerIds.flatMap((id) => {
    const box = containersById.get(id);
    return box ? [box] : [];
  });
  const getBoxes = () => {
    if (live.length === 0) return [];
    const key = live.some((box) => getBatchKey(box) === batchKey)
      ? batchKey
      : getBatchKey(live[0]);
    return groupBatches(live).find((batch) => batch.key === key)?.boxes ?? [];
  };
  const boxes = getBoxes();
  const picked = pickedId === null ? undefined : containersById.get(pickedId);
  const isBatch = picked === undefined && boxes.length > 1;
  const container = picked ?? boxes[0] ?? finished;
  const backToDetails = () => setView({ kind: 'details' });
  const pick = (id: string | null) => {
    setPickedId(id);
    setView({ kind: 'details' });
    setError(null);
  };

  const run = async (
    key: string,
    action: () => Promise<void>,
    fallback: string,
  ) => {
    setError(null);
    setBusy(key);
    try {
      await action();
    } catch (actionError) {
      setError(getErrorMessage(actionError, fallback));
    } finally {
      setBusy(null);
    }
  };

  const getBody = () => {
    if (!container) {
      return (
        <div className='grid gap-4'>
          <p className='text-muted-foreground py-4 text-center text-sm'>
            This isn't in your fridge or freezer anymore. It may have been
            finished on another device.
          </p>
          <ModalFooterActions
            rightActions={
              <Button type='button' data-modal-action='true' onClick={onClose}>
                Done
              </Button>
            }
          />
        </div>
      );
    }

    const title = getContainerTitle(container, recipesById, mealsById);
    const isInStock = container.status === 'IN_STOCK';
    const recipe =
      container.recipeId === null
        ? undefined
        : recipesById.get(container.recipeId);
    const otherPlace: ContainerPlace =
      container.place === 'FRIDGE' ? 'FREEZER' : 'FRIDGE';
    const placeWord = CONTAINER_PLACE_LABELS[container.place].toLowerCase();
    const isEachOneServing = boxes.every((box) => box.servings === 1);

    if (view.kind === 'gone' && isInStock) {
      return (
        <GoneView
          isBatch={isBatch}
          onAnswer={(answer) => {
            if (isBatch) {
              return endBatch(
                boxes,
                answer,
                `${answer === 'EAT' ? 'Ate' : 'Tossed'} all ${boxes.length} boxes`,
              );
            }
            return answer === 'EAT' ? eat(container, 'ALL') : toss(container);
          }}
          onBack={backToDetails}
          onDone={onClose}
        />
      );
    }
    if (view.kind === 'move' && isInStock) {
      return (
        <MoveView
          uid={uid}
          container={container}
          to={view.to}
          isOneOfBatch={isBatch}
          onBack={backToDetails}
          onDone={onClose}
        />
      );
    }
    if (view.kind === 'eatBy' && isInStock) {
      return (
        <EatByView
          eatBy={container.eatBy}
          onSave={(eatBy) =>
            isBatch
              ? changeBatchEatBy(boxes, eatBy)
              : changeEatBy(container, eatBy)
          }
          onBack={backToDetails}
        />
      );
    }
    if (view.kind === 'count' && isInStock && isBatch) {
      return (
        <BoxCountView
          boxes={boxes}
          onEat={(eaten, left) =>
            endBatch(
              eaten,
              'EAT',
              left === 0
                ? `Ate all ${boxes.length} boxes`
                : `Ate ${eaten.length} ${eaten.length === 1 ? 'box' : 'boxes'} · ${left} left`,
            )
          }
          onBack={backToDetails}
          onDone={onClose}
        />
      );
    }
    if (view.kind === 'count' && isInStock) {
      return (
        <CountView
          uid={uid}
          container={container}
          onBack={backToDetails}
          onDone={onClose}
        />
      );
    }
    if (view.kind === 'history') {
      return (
        <div className='grid gap-4'>
          <BackLink onClick={backToDetails} />
          <HistoryList container={container} />
        </div>
      );
    }
    if (view.kind === 'boxes' && isBatch) {
      return (
        <div className='grid gap-2'>
          <BackLink onClick={backToDetails} />
          <ul className='divide-border divide-y'>
            {boxes.map((box, index) => (
              <li key={box.id}>
                <Button
                  type='button'
                  variant='tertiary'
                  className='h-auto min-h-12 w-full justify-start gap-3 px-0! py-2 text-left font-normal'
                  onClick={() => pick(box.id)}
                >
                  <span className='text-foreground min-w-0 flex-1'>
                    Box {index + 1} · {formatServings(box.servings)}
                  </span>
                  <ChevronRight
                    className='text-muted-foreground h-5 w-5 shrink-0'
                    aria-hidden='true'
                  />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      );
    }

    const getDeleteMessage = () => {
      if (isBatch) {
        return `They and their history are erased, and this can't be undone. If you ate them, “It's gone” keeps them in What you finished instead.`;
      }
      return isInStock
        ? `${title} and its history are erased, and this can't be undone. If you ate it, “It's gone” keeps it in What you finished instead.`
        : `${title} comes off What you finished and its history is erased. This can't be undone.`;
    };
    const entries = container.history.length;
    const getMoveLabel = () => {
      if (otherPlace === 'FREEZER') {
        return isBatch ? 'Put a box in the freezer' : 'Put in the freezer';
      }
      return isBatch ? 'Thaw a box in the fridge' : 'Thaw in the fridge';
    };

    const handleDelete = async () => {
      const isConfirmed = await confirm({
        title: isBatch
          ? `Delete ${boxes.length} boxes of ${title}?`
          : `Delete ${title}?`,
        message: getDeleteMessage(),
        confirmText: 'Delete',
        destructive: true,
      });
      if (!isConfirmed) return;

      await run(
        'delete',
        async () => {
          const result = isBatch
            ? await removeBatch(boxes)
            : await remove(container);
          if (result !== undefined) onClose();
        },
        'Unable to delete this.',
      );
    };

    const handleEatOne = () =>
      run(
        'eat-one',
        async () => {
          const result = isBatch
            ? await eat(
                boxes[0],
                'ALL',
                `${isEachOneServing ? 'Ate 1' : 'Ate a box'} · ${boxes.length - 1} left`,
              )
            : await eat(container, 1);
          if (result !== undefined) onClose();
        },
        'Unable to save this.',
      );

    const lastEnd = container.history.at(-1);

    return (
      <div className='grid gap-4'>
        {picked !== undefined && boxes.length > 0 && (
          <BackLink onClick={() => pick(null)} label='All the boxes' />
        )}
        {isInStock ? (
          <Facts
            container={container}
            servingsText={
              isBatch
                ? getBatchServingsText(boxes)
                : `${formatServings(container.servings)} left`
            }
            onChangeDate={() => setView({ kind: 'eatBy' })}
          />
        ) : (
          <p className='text-muted-foreground text-sm'>
            {getFinishedText(container)} ·{' '}
            {formatDateShort(container.updatedAt)}
          </p>
        )}
        {isInStock && (
          <div className='space-y-3'>
            <Button
              type='button'
              className='h-12 w-full'
              disabled={busy === 'eat-one'}
              onClick={() => void handleEatOne()}
            >
              {isBatch && !isEachOneServing ? 'Ate a box' : 'Ate one'}
            </Button>
            <ActionGroup>
              <ActionRow
                isGrouped
                icon={<Ban className='h-4 w-4' />}
                label="It's gone"
                subtitle={
                  isBatch
                    ? 'Keeps them in What you finished'
                    : 'Keeps it in What you finished'
                }
                onClick={() => setView({ kind: 'gone' })}
              />
              <ActionRow
                isGrouped
                icon={
                  <span className='text-base leading-none'>
                    {CONTAINER_PLACE_EMOJIS[otherPlace]}
                  </span>
                }
                label={getMoveLabel()}
                subtitle='Sets a new eat-by date'
                onClick={() => setView({ kind: 'move', to: otherPlace })}
              />
              <ActionRow
                isGrouped
                icon={<Hash className='h-4 w-4' />}
                label={
                  isBatch ? 'How many boxes are left?' : 'How many are left?'
                }
                onClick={() => setView({ kind: 'count' })}
              />
              <GroupRow
                icon={<History className='h-4 w-4' />}
                onClick={() => setView({ kind: isBatch ? 'boxes' : 'history' })}
              >
                <span className='text-base'>
                  {isBatch ? 'Each box' : 'History'}
                </span>
                {!isBatch && (
                  <span className='text-muted-foreground text-sm whitespace-nowrap'>
                    {' · '}
                    {entries === 1 ? '1 entry' : `${entries} entries`}
                  </span>
                )}
              </GroupRow>
            </ActionGroup>
            {recipe === undefined && container.recipeId !== null && (
              <p className='text-muted-foreground text-xs'>
                The recipe this came from is gone. The box keeps its name.
              </p>
            )}
          </div>
        )}
        {canPutBack(container) && (
          <ActionRow
            icon={<Undo2 className='h-4 w-4' />}
            label={`Put it back in the ${placeWord}`}
            subtitle={`With ${formatServings(lastEnd?.servings ?? 0)}`}
            isDisabled={busy === 'put-back'}
            onClick={() =>
              void run(
                'put-back',
                async () => {
                  if ((await putBack(container)) !== undefined) onClose();
                },
                'Unable to save this.',
              )
            }
          />
        )}
        <ErrorLine error={error} />
        {!isInStock && <HistoryList container={container} />}
        <ModalFooterActions
          leftActions={
            <DeleteIconButton
              label={
                isBatch
                  ? `Delete these ${boxes.length} boxes`
                  : `Delete ${title}`
              }
              disabled={busy === 'delete'}
              onClick={() => void handleDelete()}
            />
          }
          rightActions={
            <Button
              type='button'
              variant='secondary'
              data-modal-action='true'
              onClick={onClose}
            >
              Done
            </Button>
          }
        />
      </div>
    );
  };

  return (
    <FormSheet
      isOpen
      onClose={onClose}
      title={
        container
          ? getContainerTitle(container, recipesById, mealsById)
          : 'Fridge & freezer'
      }
    >
      {getBody()}
    </FormSheet>
  );
}

export default ContainerSheet;
