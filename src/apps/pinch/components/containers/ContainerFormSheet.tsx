import { useEffect, useMemo, useRef, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
} from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronLeft, Plus } from 'lucide-react';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import SearchInput from '@/components/SearchInput';
import SummaryRow from '@/components/SummaryRow';
import { useBackStep } from '@/hooks/useBackHistory';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useAppSelector } from '@/store';
import { formatDateShort } from '@/utils/formatUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import ContainerFields from '@apps/pinch/components/containers/ContainerFields';
import { MAX_CONTAINER_SERVINGS, MAX_NAME_LENGTH } from '@apps/pinch/constants';
import { useContainerActions } from '@apps/pinch/hooks/useContainerActions';
import { useContainerDraft } from '@apps/pinch/hooks/useContainerDraft';
import {
  selectCookSummaries,
  selectMeals,
  selectMealsById,
  selectRecipes,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import { searchByName } from '@apps/pinch/utils/catalogSearch';
import { getRecipeCare } from '@apps/pinch/utils/recipeCare';

const { custom } = FormFactories;

const MAX_RESULTS = 4;
const MAX_RECENT = 4;
const PHONE_FOCUS_DELAY_MS = 350;
const DESKTOP_FOCUS_DELAY_MS = 30;

export type ContainerSubject =
  | { kind: 'recipe'; id: string }
  | { kind: 'meal'; id: string }
  | { kind: 'typed'; name: string };

interface PickRowProps {
  emoji: string;
  name: string;
  note: string;
  onPick: () => void;
}

function PickRow({ emoji, name, note, onPick }: PickRowProps) {
  return (
    <li>
      <Button
        type='button'
        variant='tertiary'
        onClick={onPick}
        className='h-auto min-h-14 w-full justify-start gap-3 px-0! py-1.5 text-left'
      >
        <span
          className='flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--pinch-drizzle-soft)] text-xl'
          aria-hidden='true'
        >
          {emoji}
        </span>
        <span className='min-w-0 flex-1 truncate font-medium'>{name}</span>
        <span className='text-muted-foreground text-xs font-normal'>
          {note}
        </span>
      </Button>
    </li>
  );
}

interface SubjectPickerProps {
  onPick: (subject: ContainerSubject) => void;
  /** Given when the picker replaced a form that keeps what was typed, so back returns to it. */
  onBack?: () => void;
}

function SubjectPicker({ onPick, onBack }: SubjectPickerProps) {
  const recipes = useAppSelector(selectRecipes);
  const meals = useAppSelector(selectMeals);
  const cookSummaries = useAppSelector(selectCookSummaries);
  const [query, setQuery] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);
  const isPhone = useMediaQuery().isBelow('sm');
  const trimmed = query.trim();
  useBackStep(onBack !== undefined, () => onBack?.());

  useEffect(() => {
    const timer = window.setTimeout(
      () => bodyRef.current?.querySelector('input')?.focus(),
      isPhone ? PHONE_FOCUS_DELAY_MS : DESKTOP_FOCUS_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [isPhone]);

  const matches = useMemo(() => {
    if (trimmed === '') return [];
    const found = [
      ...searchByName(
        recipes.map((recipe) => ({ name: recipe.title, recipe })),
        trimmed,
      ).map(({ recipe }) => ({
        kind: 'recipe' as const,
        id: recipe.id,
        name: recipe.title,
      })),
      ...searchByName(
        meals.map((meal) => ({ name: meal.name, meal })),
        trimmed,
      ).map(({ meal }) => ({
        kind: 'meal' as const,
        id: meal.id,
        name: meal.name,
      })),
    ];
    return found;
  }, [recipes, meals, trimmed]);

  const recent = useMemo(
    () =>
      recipes
        .flatMap((recipe) => {
          const summary = cookSummaries.get(recipe.id);
          return summary
            ? [{ recipe, lastCookedAt: summary.lastCookedAt }]
            : [];
        })
        .sort((a, b) => b.lastCookedAt - a.lastCookedAt)
        .slice(0, MAX_RECENT),
    [recipes, cookSummaries],
  );

  const shown = matches.slice(0, MAX_RESULTS);
  const hasExactName = matches.some(
    (match) => match.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );

  return (
    <div
      ref={bodyRef}
      className='grid gap-3'
      onKeyDown={(event) =>
        event.key === 'Enter' &&
        event.target instanceof HTMLInputElement &&
        event.preventDefault()
      }
    >
      {onBack && (
        <Button
          type='button'
          variant='tertiary'
          className='h-10 gap-1 justify-self-start px-0!'
          onClick={onBack}
        >
          <ChevronLeft className='h-4 w-4' aria-hidden='true' />
          Back
        </Button>
      )}
      <p className='font-medium'>What are you putting away?</p>
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder='Find a recipe or meal'
      />
      {trimmed === '' ? (
        <div className='grid gap-1'>
          {recent.length > 0 && (
            <>
              <p className='text-muted-foreground px-1 text-sm'>
                Cooked lately
              </p>
              <ul className='divide-border divide-y'>
                {recent.map(({ recipe, lastCookedAt }) => (
                  <PickRow
                    key={recipe.id}
                    emoji='🍲'
                    name={recipe.title}
                    note={`Cooked ${formatDateShort(lastCookedAt)}`}
                    onPick={() => onPick({ kind: 'recipe', id: recipe.id })}
                  />
                ))}
              </ul>
            </>
          )}
          <p className='text-muted-foreground px-1 pt-2 text-sm'>
            Pick a recipe or a saved meal, or type a name for anything else.
          </p>
        </div>
      ) : (
        <ul className='divide-border divide-y'>
          {shown.map((match) => (
            <PickRow
              key={`${match.kind}-${match.id}`}
              emoji={match.kind === 'recipe' ? '🍲' : '🍽️'}
              name={match.name}
              note={match.kind === 'recipe' ? 'Recipe' : 'Saved meal'}
              onPick={() => onPick({ kind: match.kind, id: match.id })}
            />
          ))}
          {matches.length > MAX_RESULTS && (
            <li className='text-muted-foreground py-2 text-sm'>
              {matches.length - MAX_RESULTS} more. Type a little more to narrow
              it down.
            </li>
          )}
          {!hasExactName && trimmed.length <= MAX_NAME_LENGTH && (
            <li>
              <Button
                type='button'
                variant='tertiary'
                onClick={() => onPick({ kind: 'typed', name: trimmed })}
                className='h-auto min-h-12 w-full justify-start gap-3 px-0! py-1.5 text-left'
              >
                <span className='bg-secondary text-secondary-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-full'>
                  <Plus className='h-4 w-4' aria-hidden='true' />
                </span>
                <span className='min-w-0 flex-1 truncate font-medium'>
                  Call it “{trimmed}”
                </span>
              </Button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

interface DetailsFormProps {
  uid: string;
  subject: ContainerSubject;
  isChangeable: boolean;
  onChange: () => void;
  onClose: () => void;
}

function DetailsForm({
  uid,
  subject,
  isChangeable,
  onChange,
  onClose,
}: DetailsFormProps) {
  const recipe = useAppSelector(selectRecipesById).get(
    subject.kind === 'recipe' ? subject.id : '',
  );
  const meal = useAppSelector(selectMealsById).get(
    subject.kind === 'meal' ? subject.id : '',
  );
  const { isReady, loadError, putAway } = useContainerActions(uid);
  const title =
    recipe?.title ??
    meal?.name ??
    (subject.kind === 'typed' ? subject.name : '');
  const draft = useContainerDraft({
    care: recipe ? getRecipeCare(recipe) : null,
    initialPlace: 'FRIDGE',
    initialServings:
      subject.kind === 'recipe' && recipe
        ? Math.min(
            MAX_CONTAINER_SERVINGS,
            Math.max(1, Math.floor(recipe.servings)),
          )
        : 1,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getNote = () => {
    if (loadError !== null) {
      return "Your fridge and freezer couldn't load, so adding is paused.";
    }
    return isReady ? null : 'Loading your fridge and freezer…';
  };
  const note = getNote();
  const canSave = draft.isValid && note === null && title !== '';

  const fields = [
    custom({
      name: 'details',
      label: '',
      renderComponent: () => <ContainerFields draft={draft} />,
    }),
  ];

  const handleSubmit = async () => {
    const { eatBy } = draft;
    if (!canSave || eatBy === null) return;

    setError(null);
    setIsSubmitting(true);
    try {
      await putAway(
        draft.split.map((servings) => ({
          title,
          recipeId: subject.kind === 'recipe' ? subject.id : null,
          mealId: subject.kind === 'meal' ? subject.id : null,
          cookId: null,
          madeServings: null,
          servings,
          place: draft.place,
          eatBy,
        })),
      );
      onClose();
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save this.'));
      setIsSubmitting(false);
    }
  };

  return (
    <div className='grid gap-4'>
      <SummaryRow
        label='Putting away'
        ariaLabel={`Putting away ${title}. Pick something else`}
        onClick={isChangeable ? onChange : undefined}
      >
        {title}
      </SummaryRow>
      <Form
        id='pinch-container'
        form={fields}
        initialData={{ details: '' }}
        columns={1}
        onSubmit={() => {
          void handleSubmit();
        }}
        submitButton={
          <ModalFooterActions
            note={note}
            cancelAction={
              <Button
                type='button'
                variant='secondary'
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            }
            rightActions={
              <Button
                type='submit'
                loading={isSubmitting}
                disabled={isSubmitting || !canSave}
              >
                Put away
              </Button>
            }
          />
        }
      />
      {error && (
        <p className='text-destructive text-sm' role='alert'>
          {error}
        </p>
      )}
    </div>
  );
}

interface ContainerFormSheetProps {
  uid: string;
  initial: ContainerSubject | null;
  onClose: () => void;
}

function ContainerFormSheet({
  uid,
  initial,
  onClose,
}: ContainerFormSheetProps) {
  const [subject, setSubject] = useState<ContainerSubject | null>(initial);
  const [isPicking, setIsPicking] = useState(false);
  const isPickerShown = subject === null || isPicking;

  return (
    <FormSheet isOpen onClose={onClose} title='Fridge & freezer'>
      {isPickerShown && (
        <SubjectPicker
          onPick={(next) => {
            setSubject(next);
            setIsPicking(false);
          }}
          onBack={subject === null ? undefined : () => setIsPicking(false)}
        />
      )}
      {subject !== null && (
        <div className={join(isPickerShown && 'hidden')}>
          <DetailsForm
            key={`${subject.kind}-${subject.kind === 'typed' ? subject.name : subject.id}`}
            uid={uid}
            subject={subject}
            isChangeable={initial === null}
            onChange={() => setIsPicking(true)}
            onClose={onClose}
          />
        </div>
      )}
    </FormSheet>
  );
}

export default ContainerFormSheet;
