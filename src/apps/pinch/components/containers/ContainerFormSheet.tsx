import { useEffect, useMemo, useRef, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
} from '@moondreamsdev/dreamer-ui/components';
import { Plus } from 'lucide-react';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import SearchInput from '@/components/SearchInput';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import ContainerFields from '@apps/pinch/components/containers/ContainerFields';
import { MAX_CONTAINER_SERVINGS, MAX_NAME_LENGTH } from '@apps/pinch/constants';
import { useContainerActions } from '@apps/pinch/hooks/useContainerActions';
import { useContainerDraft } from '@apps/pinch/hooks/useContainerDraft';
import {
  selectMeals,
  selectMealsById,
  selectRecipes,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import { searchByName } from '@apps/pinch/utils/catalogSearch';
import { getRecipeCare } from '@apps/pinch/utils/recipeCare';

const { custom } = FormFactories;

const MAX_RESULTS = 4;
const PHONE_FOCUS_DELAY_MS = 350;
const DESKTOP_FOCUS_DELAY_MS = 30;

export type ContainerSubject =
  | { kind: 'recipe'; id: string }
  | { kind: 'meal'; id: string }
  | { kind: 'typed'; name: string };

interface SubjectPickerProps {
  onPick: (subject: ContainerSubject) => void;
}

function SubjectPicker({ onPick }: SubjectPickerProps) {
  const recipes = useAppSelector(selectRecipes);
  const meals = useAppSelector(selectMeals);
  const [query, setQuery] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);
  const isPhone = useMediaQuery().isBelow('sm');
  const trimmed = query.trim();

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

  const shown = matches.slice(0, MAX_RESULTS);
  const hasExactName = matches.some(
    (match) => match.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );

  return (
    <div
      ref={bodyRef}
      className='space-y-3'
      onKeyDown={(event) =>
        event.key === 'Enter' &&
        event.target instanceof HTMLInputElement &&
        event.preventDefault()
      }
    >
      <p className='font-medium'>What are you putting away?</p>
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder='Find a recipe or meal'
      />
      {trimmed === '' ? (
        <p className='text-muted-foreground px-1 text-sm'>
          Pick a recipe or a saved meal, or type a name for anything else.
        </p>
      ) : (
        <ul className='divide-border divide-y'>
          {shown.map((match) => (
            <li key={`${match.kind}-${match.id}`}>
              <Button
                type='button'
                variant='tertiary'
                onClick={() => onPick({ kind: match.kind, id: match.id })}
                className='h-auto min-h-12 w-full justify-start gap-3 px-0! py-1.5 text-left'
              >
                <span
                  className='flex w-7 shrink-0 justify-center text-xl'
                  aria-hidden='true'
                >
                  {match.kind === 'recipe' ? '🍲' : '🍽️'}
                </span>
                <span className='min-w-0 flex-1 truncate font-medium'>
                  {match.name}
                </span>
                <span className='text-muted-foreground text-xs font-normal'>
                  {match.kind === 'recipe' ? 'Recipe' : 'Meal'}
                </span>
              </Button>
            </li>
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
      return "Your prepared meals couldn't load, so adding is paused.";
    }
    return isReady ? null : 'Loading your prepared meals…';
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
      setError(getErrorMessage(saveError, 'Unable to save this container.'));
      setIsSubmitting(false);
    }
  };

  return (
    <div className='grid gap-4'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='text-lg font-medium wrap-break-word'>{title}</p>
          <p className='text-muted-foreground text-sm'>
            {subject.kind === 'recipe'
              ? 'Recipe'
              : subject.kind === 'meal'
                ? 'Saved meal'
                : 'Typed name'}
          </p>
        </div>
        {isChangeable && (
          <Button
            type='button'
            variant='link'
            size='sm'
            className='h-10 shrink-0 px-0!'
            onClick={onChange}
          >
            Change
          </Button>
        )}
      </div>
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

  return (
    <FormSheet isOpen onClose={onClose} title='Container'>
      {subject === null ? (
        <SubjectPicker onPick={setSubject} />
      ) : (
        <DetailsForm
          key={`${subject.kind}-${subject.kind === 'typed' ? subject.name : subject.id}`}
          uid={uid}
          subject={subject}
          isChangeable={initial === null}
          onChange={() => setSubject(null)}
          onClose={onClose}
        />
      )}
    </FormSheet>
  );
}

export default ContainerFormSheet;
