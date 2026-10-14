import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import {
  Ban,
  CalendarClock,
  ChevronLeft,
  CircleCheck,
  Utensils,
} from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import DeleteIconButton from '@/components/DeleteIconButton';
import FormSection from '@/components/FormSection';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import Stepper from '@/components/Stepper';
import { useAppDispatch, useAppSelector } from '@/store';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateShort, formatTime } from '@/utils/formatUtils';
import EatByBadge from '@apps/pinch/components/containers/EatByBadge';
import EatByField from '@apps/pinch/components/containers/EatByField';
import {
  CONTAINER_PLACE_EMOJIS,
  CONTAINER_PLACE_LABELS,
} from '@apps/pinch/constants';
import { useContainerActions } from '@apps/pinch/hooks/useContainerActions';
import {
  changeContainerEatBy,
  moveContainer,
  removeContainer,
} from '@apps/pinch/store/actions/containerActions';
import {
  selectContainersById,
  selectMealsById,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import type { Container, ContainerPlace } from '@apps/pinch/types';
import {
  getContainerTitle,
  getEatByDefault,
  getEatByHint,
  getEatByPhrase,
  getEatByState,
  getEndText,
  getEventText,
  getFreezeLine,
  getMoveForPlace,
  isValidEatBy,
} from '@apps/pinch/utils/containers';
import { getRecipeCare } from '@apps/pinch/utils/recipeCare';
import { formatServings } from '@apps/pinch/utils/recipeFormat';

type SheetView =
  | { kind: 'details' }
  | { kind: 'eat' }
  | { kind: 'move'; to: ContainerPlace }
  | { kind: 'eatBy' };

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

function EatView({
  uid,
  container,
  onBack,
  onFinished,
}: SubviewProps & { onFinished: () => void }) {
  const { eat } = useContainerActions(uid);
  const [count, setCount] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amount = Math.min(count, container.servings);

  const handleEat = async () => {
    setError(null);
    setIsSaving(true);
    try {
      const isFinished = await eat(container, amount);
      if (isFinished) {
        onFinished();
        return;
      }
      onBack();
    } catch (eatError) {
      setError(getErrorMessage(eatError, 'Unable to save this.'));
      setIsSaving(false);
    }
  };

  return (
    <div className='grid gap-4'>
      <BackLink onClick={onBack} />
      <div className='space-y-1'>
        <p className='font-medium'>How many did you eat?</p>
        <p className='text-muted-foreground text-sm'>
          {formatServings(container.servings)} in this container.
        </p>
      </div>
      <Stepper
        value={amount}
        onChange={setCount}
        label='Servings eaten'
        min={1}
        max={container.servings}
        step={1}
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
            disabled={isSaving}
            onClick={() => void handleEat()}
          >
            {`Ate ${amount}`}
          </Button>
        }
      />
    </div>
  );
}

function MoveView({
  uid,
  container,
  to,
  onBack,
}: SubviewProps & { to: ContainerPlace }) {
  const dispatch = useAppDispatch();
  const recipe = useAppSelector(selectRecipesById).get(
    container.recipeId ?? '',
  );
  const move = getMoveForPlace(to, container.place);
  const preset = getEatByDefault(move, recipe ? getRecipeCare(recipe) : null);
  const [typedEatBy, setTypedEatBy] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eatByText = typedEatBy ?? toDateInputValue(preset.eatBy);
  const eatBy = fromDateInputValue(eatByText) ?? null;
  const isValid = eatBy !== null && isValidEatBy(eatBy);
  const label = to === 'FREEZER' ? 'Put in the freezer' : 'Thaw in the fridge';

  const handleMove = async () => {
    if (!isValid) return;

    setError(null);
    setIsSaving(true);
    try {
      await dispatch(
        moveContainer({ uid, id: container.id, to, eatBy }),
      ).unwrap();
      onBack();
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
          {move === 'THAW'
            ? 'Thawed food keeps a shorter time, so the eat-by date moves up.'
            : 'The whole container goes in, and the eat-by date moves out.'}
        </p>
      </div>
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
  const dispatch = useAppDispatch();
  const [typedEatBy, setTypedEatBy] = useState(
    toDateInputValue(container.eatBy),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eatBy = fromDateInputValue(typedEatBy) ?? null;
  const canSave =
    eatBy !== null && isValidEatBy(eatBy) && eatBy !== container.eatBy;

  const handleSave = async () => {
    if (!canSave) return;

    setError(null);
    setIsSaving(true);
    try {
      await dispatch(
        changeContainerEatBy({ uid, id: container.id, eatBy }),
      ).unwrap();
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

interface ContainerSheetProps {
  uid: string;
  containerId: string;
  /** A finished container comes from the Finished view, not the live store. */
  finished: Container | null;
  onClose: () => void;
}

/** One container: where it is, how much is left, when to eat it by, what has happened to it, and what can be done. */
function ContainerSheet({
  uid,
  containerId,
  finished,
  onClose,
}: ContainerSheetProps) {
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const { eat, toss } = useContainerActions(uid);
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
            This container isn't in stock anymore. It may have been finished on
            another device.
          </p>
          <ModalFooterActions
            rightActions={
              <Button type='button' onClick={onClose}>
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

    if (view.kind === 'eat' && isInStock) {
      return (
        <EatView
          uid={uid}
          container={container}
          onBack={backToDetails}
          onFinished={onClose}
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
        />
      );
    }
    if (view.kind === 'eatBy' && isInStock) {
      return (
        <EatByView uid={uid} container={container} onBack={backToDetails} />
      );
    }

    const handleDelete = async () => {
      const isConfirmed = await confirm({
        title: 'Delete this container?',
        message: isInStock
          ? `${title} and its history are erased, and this can't be undone. If you ate it, “Ate it all” keeps it in Finished instead.`
          : `${title} comes off Finished and its history is erased. This can't be undone.`,
        confirmText: 'Delete',
        destructive: true,
      });
      if (!isConfirmed) return;

      await run(
        'delete',
        async () => {
          await dispatch(removeContainer({ uid, id: container.id })).unwrap();
          onClose();
        },
        'Unable to delete this container.',
      );
    };

    const handleToss = async () => {
      const isConfirmed = await confirm({
        title: 'Threw it out?',
        message: `${formatServings(container.servings)} of ${title} ${container.servings === 1 ? 'is' : 'are'} marked as thrown out and it moves to Finished. You can undo it for a few seconds.`,
        confirmText: 'Threw it out',
        cancelText: 'Keep it',
        destructive: true,
      });
      if (!isConfirmed) return;

      await run(
        'toss',
        async () => {
          await toss(container);
          onClose();
        },
        'Unable to save this.',
      );
    };

    const freezeLine = getFreezeLine(container.history);
    const last = container.history.at(-1);
    const state = getEatByState(container.eatBy);
    const otherPlace: ContainerPlace =
      container.place === 'FRIDGE' ? 'FREEZER' : 'FRIDGE';
    const eatenOne = busy === 'eat-one';

    return (
      <div className='grid gap-4'>
        <div className='space-y-1.5'>
          <p className='text-lg font-medium wrap-break-word'>{title}</p>
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
              <p className='flex flex-wrap items-center gap-x-2 gap-y-1 text-sm'>
                <span className='whitespace-nowrap'>
                  Eat by {getEatByPhrase(container.eatBy)}
                </span>
                <EatByBadge state={state} />
              </p>
              {(freezeLine || last?.kind === 'THAW') && (
                <p className='text-muted-foreground text-sm'>
                  {[
                    last?.kind === 'THAW'
                      ? `Thawed in the fridge on ${formatDateShort(last.at)}`
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
              {getEndText(container)} · {formatDateShort(container.updatedAt)}
            </p>
          )}
        </div>
        {isInStock && (
          <div className='space-y-2'>
            <ActionGroup>
              <ActionRow
                isGrouped
                icon={<Utensils className='h-4 w-4' />}
                label='Ate 1'
                subtitle={
                  container.servings === 1
                    ? 'That is the last one'
                    : `Leaves ${formatServings(container.servings - 1)}`
                }
                isDisabled={eatenOne}
                onClick={() =>
                  void run(
                    'eat-one',
                    async () => {
                      if (await eat(container, 1)) onClose();
                    },
                    'Unable to save this.',
                  )
                }
              />
              {container.servings > 2 && (
                <ActionRow
                  isGrouped
                  icon={<Utensils className='h-4 w-4' />}
                  label='Ate some…'
                  subtitle='Choose how many'
                  onClick={() => setView({ kind: 'eat' })}
                />
              )}
              <ActionRow
                isGrouped
                icon={<CircleCheck className='h-4 w-4' />}
                label='Ate it all'
                subtitle='Moves it to Finished'
                isDisabled={busy === 'eat-all'}
                onClick={() =>
                  void run(
                    'eat-all',
                    async () => {
                      await eat(container, 'ALL');
                      onClose();
                    },
                    'Unable to save this.',
                  )
                }
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
                subtitle={
                  otherPlace === 'FREEZER'
                    ? 'Moves the eat-by date out'
                    : 'Moves the eat-by date up'
                }
                onClick={() => setView({ kind: 'move', to: otherPlace })}
              />
              <ActionRow
                isGrouped
                icon={<CalendarClock className='h-4 w-4' />}
                label='Change eat-by date'
                subtitle={`Now ${getEatByPhrase(container.eatBy)}`}
                onClick={() => setView({ kind: 'eatBy' })}
              />
              <ActionRow
                isGrouped
                icon={<Ban className='h-4 w-4' />}
                label='Threw it out'
                subtitle='Keeps it in Finished'
                isDisabled={busy === 'toss'}
                onClick={() => void handleToss()}
              />
            </ActionGroup>
            {recipe === undefined && container.recipeId !== null && (
              <p className='text-muted-foreground text-xs'>
                The recipe this came from is gone. The container keeps its name.
              </p>
            )}
          </div>
        )}
        {error && (
          <p className='text-destructive text-sm' role='alert'>
            {error}
          </p>
        )}
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
        <ModalFooterActions
          leftActions={
            <DeleteIconButton
              label='Delete this container'
              disabled={busy === 'delete'}
              onClick={() => void handleDelete()}
            />
          }
          rightActions={
            <Button type='button' onClick={onClose}>
              Done
            </Button>
          }
        />
      </div>
    );
  };

  return (
    <FormSheet isOpen onClose={onClose} title='Container'>
      {getBody()}
    </FormSheet>
  );
}

export default ContainerSheet;
