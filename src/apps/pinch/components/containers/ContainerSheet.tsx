import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { Ban, ChevronLeft, Hash, PencilLine, Undo2 } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import DeleteIconButton from '@/components/DeleteIconButton';
import FormSection from '@/components/FormSection';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import Stepper from '@/components/Stepper';
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
} from '@apps/pinch/store/selectors';
import type { Container, ContainerPlace } from '@apps/pinch/types';
import {
  getContainerTitle,
  getCountChangeCopy,
  getEatByDefault,
  getEatByHint,
  getEatByPhrase,
  getEatByState,
  getEventText,
  getFinishedText,
  getFreezeLine,
  getLastPlaceEvent,
  getMoveForPlace,
  getMoveNotes,
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
  | { kind: 'history' };

interface SubviewProps {
  uid: string;
  container: Container;
  onBack: () => void;
}

interface BackLinkProps {
  onClick: () => void;
}

function BackLink({ onClick }: BackLinkProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      className='h-10 gap-1 justify-self-start px-0!'
      onClick={onClick}
    >
      <ChevronLeft className='h-4 w-4' aria-hidden='true' />
      Back
    </Button>
  );
}

function GoneView({
  uid,
  container,
  onBack,
  onDone,
}: SubviewProps & { onDone: () => void }) {
  const { eat, toss } = useContainerActions(uid);
  const [busy, setBusy] = useState<'ate' | 'tossed' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handle = async (answer: 'ate' | 'tossed') => {
    if (busy !== null) return;

    setError(null);
    setBusy(answer);
    try {
      const result =
        answer === 'ate' ? await eat(container, 'ALL') : await toss(container);
      if (result !== undefined) onDone();
    } catch (endError) {
      setError(getErrorMessage(endError, 'Unable to save this.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className='grid gap-4'>
      <BackLink onClick={onBack} />
      <p className='font-medium'>What happened to it?</p>
      <div className='grid grid-cols-2 gap-3'>
        <Button
          type='button'
          variant='secondary'
          className='h-12'
          loading={busy === 'ate'}
          disabled={busy !== null}
          onClick={() => void handle('ate')}
        >
          Ate it
        </Button>
        <Button
          type='button'
          variant='secondary'
          className='h-12'
          loading={busy === 'tossed'}
          disabled={busy !== null}
          onClick={() => void handle('tossed')}
        >
          Tossed
        </Button>
      </div>
      {error && (
        <p className='text-destructive text-sm' role='alert'>
          {error}
        </p>
      )}
    </div>
  );
}

function MoveView({
  uid,
  container,
  to,
  onBack,
  onDone,
}: SubviewProps & { to: ContainerPlace; onDone: () => void }) {
  const { move: moveContainer } = useContainerActions(uid);
  const recipe = useAppSelector(selectRecipesById).get(
    container.recipeId ?? '',
  );
  const move = getMoveForPlace(to, container.place);
  const preset = getEatByDefault(
    move,
    recipe ? getRecipeCare(recipe) : null,
    undefined,
    container.eatBy,
  );
  const notes = getMoveNotes(container, move, preset);
  const [typedEatBy, setTypedEatBy] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eatByText = typedEatBy ?? toDateInputValue(preset.eatBy);
  const eatBy = fromDateInputValue(eatByText) ?? null;
  const isValid = eatBy !== null && isValidEatBy(eatBy);
  const label = to === 'FREEZER' ? 'Put in the freezer' : 'Thaw in the fridge';

  const handleMove = async () => {
    if (!isValid || isSaving) return;

    setError(null);
    setIsSaving(true);
    try {
      if ((await moveContainer(container, to, eatBy)) !== undefined) onDone();
      else setIsSaving(false);
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
          The whole box goes in the {to === 'FREEZER' ? 'freezer' : 'fridge'}.
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
      {error && (
        <p className='text-destructive text-sm' role='alert'>
          {error}
        </p>
      )}
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

function EatByView({ uid, container, onBack }: SubviewProps) {
  const { changeEatBy } = useContainerActions(uid);
  const [typedEatBy, setTypedEatBy] = useState(
    toDateInputValue(container.eatBy),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eatBy = fromDateInputValue(typedEatBy) ?? null;
  const canSave =
    eatBy !== null && isValidEatBy(eatBy) && eatBy !== container.eatBy;

  const handleSave = async () => {
    if (!canSave || isSaving) return;

    setError(null);
    setIsSaving(true);
    try {
      await changeEatBy(container, eatBy);
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
      {error && (
        <p className='text-destructive text-sm' role='alert'>
          {error}
        </p>
      )}
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

function CountView({
  uid,
  container,
  onBack,
  onDone,
}: SubviewProps & { onDone: () => void }) {
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
      {error && (
        <p className='text-destructive text-sm' role='alert'>
          {error}
        </p>
      )}
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

interface ContainerSheetProps {
  uid: string;
  containerId: string;
  /** Finished containers are not in the live store. */
  finished: Container | null;
  onClose: () => void;
}

function ContainerSheet({
  uid,
  containerId,
  finished,
  onClose,
}: ContainerSheetProps) {
  const { confirm } = useActionModal();
  const { eat, remove, putBack } = useContainerActions(uid);
  const live = useAppSelector(selectContainersById).get(containerId);
  const recipesById = useAppSelector(selectRecipesById);
  const mealsById = useAppSelector(selectMealsById);
  const [view, setView] = useState<SheetView>({ kind: 'details' });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const container = live ?? finished;
  const backToDetails = () => setView({ kind: 'details' });

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

    if (view.kind === 'gone' && isInStock) {
      return (
        <GoneView
          uid={uid}
          container={container}
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
          onBack={backToDetails}
          onDone={onClose}
        />
      );
    }
    if (view.kind === 'eatBy' && isInStock) {
      return (
        <EatByView uid={uid} container={container} onBack={backToDetails} />
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

    const handleDelete = async () => {
      const isConfirmed = await confirm({
        title: `Delete ${title}?`,
        message: isInStock
          ? `${title} and its history are erased, and this can't be undone. If you ate it, “It's gone” keeps it in What you finished instead.`
          : `${title} comes off What you finished and its history is erased. This can't be undone.`,
        confirmText: 'Delete',
        destructive: true,
      });
      if (!isConfirmed) return;

      await run(
        'delete',
        async () => {
          if ((await remove(container)) !== undefined) onClose();
        },
        'Unable to delete this.',
      );
    };

    const freezeLine = getFreezeLine(container.history);
    const lastPlace = getLastPlaceEvent(container.history);
    const thawedAt = lastPlace?.kind === 'THAW' ? lastPlace.at : null;
    const state = getEatByState(container.eatBy);
    const otherPlace: ContainerPlace =
      container.place === 'FRIDGE' ? 'FREEZER' : 'FRIDGE';
    const placeWord = CONTAINER_PLACE_LABELS[container.place].toLowerCase();
    const lastEnd = container.history.at(-1);
    const canPutBack =
      !isInStock && lastEnd?.kind === 'CLEAR' && lastEnd.servings !== null;

    return (
      <div className='grid gap-4'>
        <div className='space-y-1.5'>
          {isInStock ? (
            <>
              <p className='text-muted-foreground flex flex-wrap gap-x-3 text-sm'>
                <span className='whitespace-nowrap'>
                  <span aria-hidden='true'>
                    {CONTAINER_PLACE_EMOJIS[container.place]}
                  </span>{' '}
                  {CONTAINER_PLACE_LABELS[container.place]}
                </span>
                <span className='whitespace-nowrap'>
                  {formatServings(container.servings)} left
                </span>
              </p>
              <Button
                type='button'
                variant='tertiary'
                aria-label={`Eat by ${getEatByPhrase(container.eatBy)}. Change the date`}
                className="text-foreground! relative h-auto min-h-0 flex-wrap justify-start gap-x-2 gap-y-1 px-0! py-0! text-left text-sm font-normal before:absolute before:inset-x-0 before:-inset-y-2.5 before:content-['']"
                onClick={() => setView({ kind: 'eatBy' })}
              >
                <span className='whitespace-nowrap'>
                  Eat by {getEatByPhrase(container.eatBy)}
                </span>
                <EatByBadge state={state} />
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
            </>
          ) : (
            <p className='text-muted-foreground text-sm'>
              {getFinishedText(container)} ·{' '}
              {formatDateShort(container.updatedAt)}
            </p>
          )}
        </div>
        {isInStock && (
          <div className='space-y-3'>
            <Button
              type='button'
              className='h-12 w-full'
              disabled={busy === 'eat-one'}
              onClick={() =>
                void run(
                  'eat-one',
                  async () => {
                    if ((await eat(container, 1)) !== undefined) onClose();
                  },
                  'Unable to save this.',
                )
              }
            >
              Ate one
            </Button>
            <ActionGroup>
              <ActionRow
                isGrouped
                icon={<Ban className='h-4 w-4' />}
                label="It's gone"
                subtitle='Keeps it in What you finished'
                onClick={() => setView({ kind: 'gone' })}
              />
              <ActionRow
                isGrouped
                icon={
                  <span className='text-base leading-none'>
                    {CONTAINER_PLACE_EMOJIS[otherPlace]}
                  </span>
                }
                label={
                  otherPlace === 'FREEZER'
                    ? 'Put in the freezer'
                    : 'Thaw in the fridge'
                }
                subtitle='Sets a new eat-by date'
                onClick={() => setView({ kind: 'move', to: otherPlace })}
              />
              <ActionRow
                isGrouped
                icon={<Hash className='h-4 w-4' />}
                label='How many are left?'
                onClick={() => setView({ kind: 'count' })}
              />
            </ActionGroup>
            {recipe === undefined && container.recipeId !== null && (
              <p className='text-muted-foreground text-xs'>
                The recipe this came from is gone. The box keeps its name.
              </p>
            )}
          </div>
        )}
        {canPutBack && (
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
        {error && (
          <p className='text-destructive text-sm' role='alert'>
            {error}
          </p>
        )}
        {isInStock ? (
          <Button
            type='button'
            variant='tertiary'
            className='decoration-muted-foreground/50 -my-2 h-10 justify-self-start px-0! text-sm font-normal underline underline-offset-4'
            onClick={() => setView({ kind: 'history' })}
          >
            See its history
          </Button>
        ) : (
          <HistoryList container={container} />
        )}
        <ModalFooterActions
          leftActions={
            <DeleteIconButton
              label={`Delete ${title}`}
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
