import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import { Button, Input, Popover } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Pencil, Plus, Search, Trash2, Ungroup, X } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import DetailSheet from '@/components/DetailSheet';
import Field from '@/components/forms/Field';
import LabelChip from '@/components/LabelChip';
import ModalFooterActions from '@/components/ModalFooterActions';
import PickOrCreate, { NEW_CHOICE } from '@/components/forms/PickOrCreate';
import RevealChip from '@/components/RevealChip';
import SectionDivider from '@/components/SectionDivider';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useAppSelector } from '@/store';
import { generateUuid } from '@/utils';
import { blockEnterSubmit } from '@/utils/formKeyUtils';
import ItemSearch, {
  type ItemSuggestions,
} from '@apps/pinch/components/plan/ItemSearch';
import {
  isRowAmountValid,
  type IngredientRow,
} from '@apps/pinch/components/recipes/recipeFormModel';
import UnitSelect from '@apps/pinch/components/shared/UnitSelect';
import {
  DEFAULT_SERVING,
  MAX_INGREDIENT_GROUP_LENGTH,
  MAX_NAME_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_RECIPE_INGREDIENTS,
  UNIT_LABELS,
} from '@apps/pinch/constants';
import {
  selectIngredients,
  selectIngredientsById,
  selectOftenUsedIngredientIds,
} from '@apps/pinch/store/selectors';
import { findNearMatches } from '@apps/pinch/utils/catalogSearch';
import {
  cleanGroupName,
  getGroupKey,
  getGroupNames,
  groupIngredientLines,
  orderIngredientLines,
  placeLineInGroup,
  renameLineGroup,
  resolveGroupName,
  restoreLineGroup,
  ungroupLines,
} from '@apps/pinch/utils/ingredientGroups';
import {
  matchIngredient,
  normalizeName,
} from '@apps/pinch/utils/ingredientMatch';
import { toTypedIngredientName } from '@apps/pinch/utils/ingredientNames';
import { takeSuggestionIds } from '@apps/pinch/utils/pickerSuggestions';

const PHONE_FOCUS_DELAY_MS = 350;
const DESKTOP_FOCUS_DELAY_MS = 30;

/** A rename remounts the heading under its new name, so focus finds it by its key. */
const focusGroupHeading = (group: string) =>
  window.requestAnimationFrame(() =>
    document
      .querySelector<HTMLElement>(
        `[data-group-heading="${CSS.escape(getGroupKey(group))}"]`,
      )
      ?.focus({ preventScroll: true }),
  );

/** The ingredients a search in this group leaves out: one already in it is there, and in another group it may be listed again. */
const getUsedInGroup = (rows: IngredientRow[], group: string | null) =>
  rows
    .filter((row) => getGroupKey(row.group) === getGroupKey(group))
    .map((row) => row.ingredientId);

const getAmountLabel = (row: IngredientRow) => {
  if (row.isAmountless) return row.note ?? '';
  if (isRowAmountValid(row)) {
    return `${Math.round(Number(row.amount) * 100) / 100} ${UNIT_LABELS[row.unit]}`;
  }
  return row.amount.trim() === '' ? 'Add an amount' : 'Check the amount';
};

/** What an unresolved line becomes when the person adds its name as a new ingredient. */
const getStagedPatch = (rows: IngredientRow[], row: IngredientRow) => {
  const name = toTypedIngredientName(row.proposedName ?? '');

  return {
    ingredientId: getStagedId(rows, name),
    newName: name,
    proposedName: null,
  };
};

/** The id a new ingredient already has in this form when a line names it, else a fresh one, so two lines naming it share one ingredient. */
const getStagedId = (rows: IngredientRow[], name: string) =>
  rows.find(
    (row) =>
      row.newName !== null &&
      normalizeName(row.newName) === normalizeName(name),
  )?.ingredientId ?? generateUuid();

interface NewNameFieldProps {
  name: string;
  /** Shown under the field until a name the person already has is offered in its place, so the field never moves as they type. */
  hint: string;
  usedIds: readonly string[];
  /** `isFinal` is false while the person is still typing, when the name must not merge with another staged one. */
  onRename: (name: string, isFinal: boolean) => void;
  onUseExisting?: (ingredientId: string) => void;
}

/** The name of an ingredient being made in this form: editable until the recipe is saved, cased like the app's own names when the field is left, and never empty. */
function NewNameField({
  name,
  hint,
  usedIds,
  onRename,
  onUseExisting,
}: NewNameFieldProps) {
  const ingredients = useAppSelector(selectIngredients);
  const [draft, setDraft] = useState(name);
  const openedName = useRef(name);
  const existing = useMemo(
    () => (onUseExisting ? matchIngredient(draft, ingredients) : null),
    [onUseExisting, draft, ingredients],
  );

  return (
    <div className='space-y-2'>
      <Field label='Name'>
        {(id) => (
          <Input
            id={id}
            variant='outline'
            value={draft}
            maxLength={MAX_NAME_LENGTH}
            onChange={(event) => {
              setDraft(event.target.value);
              if (event.target.value.trim() !== '')
                onRename(event.target.value, false);
            }}
            onBlur={() => {
              const next = toTypedIngredientName(draft);
              setDraft(next === '' ? openedName.current : next);
              if (next === '') {
                onRename(openedName.current, true);
                return;
              }
              const same = ingredients.find(
                (ingredient) =>
                  normalizeName(ingredient.name) === normalizeName(next),
              );
              if (same && onUseExisting && !usedIds.includes(same.id)) {
                onUseExisting(same.id);
                return;
              }
              onRename(next, true);
            }}
          />
        )}
      </Field>
      <div className='flex min-h-10 flex-wrap items-center gap-x-2 gap-y-3'>
        {existing && onUseExisting && !usedIds.includes(existing.id) ? (
          <>
            <span className='text-muted-foreground text-xs'>
              Already in your ingredients
            </span>
            <Button
              type='button'
              size='sm'
              rounded='full'
              variant='secondary'
              className="relative after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']"
              aria-label={`Use ${existing.name}`}
              onClick={() => onUseExisting(existing.id)}
            >
              {existing.name}
            </Button>
          </>
        ) : (
          <p className='text-muted-foreground text-xs'>{hint}</p>
        )}
      </div>
    </div>
  );
}

interface GroupFieldProps {
  group: string | null;
  /** The recipe's group names when the editor opened, so a name being typed never becomes a pill under the field. */
  names: string[];
  onChange: (group: string | null) => void;
}

function GroupField({ group, names, onChange }: GroupFieldProps) {
  const [choice, setChoice] = useState(group ?? '');
  const [newText, setNewText] = useState('');
  const [isShown, setIsShown] = useState(group !== null || names.length > 0);
  const wrapRef = useRef<HTMLDivElement>(null);

  if (!isShown) {
    return (
      <RevealChip
        icon={<Plus className='h-4 w-4' aria-hidden='true' />}
        onClick={() => {
          setIsShown(true);
          window.requestAnimationFrame(() =>
            wrapRef.current?.querySelector('input')?.focus(),
          );
        }}
      >
        Put it in a group
      </RevealChip>
    );
  }

  return (
    <div ref={wrapRef} className='space-y-1.5'>
      <p className='font-medium'>Group</p>
      <PickOrCreate
        label='Group'
        options={names.map((name) => ({ value: name, label: name }))}
        choice={choice}
        newText={newText}
        newPillLabel='New group'
        newPlaceholder='For the sauce'
        maxLength={MAX_INGREDIENT_GROUP_LENGTH}
        clearLabel='No group'
        onChange={(nextChoice, nextText) => {
          setChoice(nextChoice);
          setNewText(nextText);
          if (nextChoice !== NEW_CHOICE) {
            onChange(nextChoice === '' ? null : nextChoice);
          } else {
            onChange(nextText);
          }
        }}
      />
      <p className='text-muted-foreground text-xs'>
        {names.length === 0
          ? 'Lines with the same group show together under its name.'
          : 'Need it in two groups? Add the line again under the other.'}
      </p>
    </div>
  );
}

interface IngredientEditorProps {
  uid: string;
  row: IngredientRow;
  rows: IngredientRow[];
  onUpdate: (patch: Partial<IngredientRow>) => void;
  onRemove: () => void;
  /** Removing belongs to a line that exists; a line being added has nothing to remove yet. */
  showRemove: boolean;
  onRename: (ingredientId: string, name: string, isFinal: boolean) => void;
  onUseExisting: (fromId: string, toId: string) => void;
}

/** One ingredient's details: amount, unit and a preparation note, or the way to resolve a name the reader found that no ingredient matches. */
function IngredientEditor({
  uid,
  row,
  rows,
  onUpdate,
  onRemove,
  showRemove,
  onRename,
  onUseExisting,
}: IngredientEditorProps) {
  const [isChoosing, setIsChoosing] = useState(false);
  const [isAmountJustAdded, setIsAmountJustAdded] = useState(false);
  const [groupNames] = useState(() => getGroupNames(rows));
  const noteRef = useRef<HTMLInputElement>(null);
  const ingredients = useAppSelector(selectIngredients);
  const servingUnit = useAppSelector(selectIngredientsById).get(
    row.ingredientId,
  )?.serving.unit;
  const isUnresolved = row.ingredientId === '';
  const proposedName = row.proposedName ?? '';
  const [openedName] = useState(proposedName);
  const usedInGroup = getUsedInGroup(
    rows.filter((candidate) => candidate.id !== row.id),
    row.group,
  );
  const usedIds = usedInGroup.join(',');
  const nearMatches = useMemo(() => {
    if (!isUnresolved) return [];
    const used = new Set(usedIds.split(','));
    const result = findNearMatches(
      ingredients.filter((ingredient) => !used.has(ingredient.id)),
      openedName,
    );
    return result;
  }, [isUnresolved, ingredients, openedName, usedIds]);

  if (isUnresolved) {
    return (
      <div className='space-y-3' onKeyDown={blockEnterSubmit}>
        <NewNameField
          key='proposed'
          name={proposedName}
          hint='Not in your ingredients yet. Pick one you have, or add it as new.'
          usedIds={usedInGroup}
          onRename={(name) => onUpdate({ proposedName: name })}
        />
        {nearMatches.length > 0 && (
          <div className='space-y-1.5'>
            <p className='text-muted-foreground text-xs'>
              Did you mean one of these?
            </p>
            <ul className='border-border divide-border divide-y overflow-hidden rounded-2xl border'>
              {nearMatches.map((ingredient) => (
                <li key={ingredient.id}>
                  <Button
                    type='button'
                    variant='tertiary'
                    aria-label={`Use ${ingredient.name}`}
                    className='h-auto min-h-12 w-full justify-start px-4! py-2 text-left font-normal'
                    onClick={() =>
                      onUpdate({
                        ingredientId: ingredient.id,
                        proposedName: null,
                        newName: null,
                      })
                    }
                  >
                    {ingredient.name}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <ActionRow
          icon={<Search className='h-4 w-4' />}
          label='Pick from your ingredients'
          hasChevron
          onClick={() => setIsChoosing((current) => !current)}
        />
        {isChoosing && (
          <ItemSearch
            uid={uid}
            excludeIds={usedInGroup}
            onPick={(ingredientId) => {
              setIsChoosing(false);
              onUpdate({ ingredientId, proposedName: null, newName: null });
            }}
            onStageNew={(name) => {
              setIsChoosing(false);
              onUpdate({
                ingredientId: getStagedId(rows, name),
                newName: name,
                proposedName: null,
              });
            }}
          />
        )}
        {showRemove && (
          <ActionRow
            isDestructive
            icon={<Trash2 className='h-4 w-4' />}
            label='Remove from this recipe'
            onClick={onRemove}
          />
        )}
      </div>
    );
  }

  return (
    <div className='space-y-3' onKeyDown={blockEnterSubmit}>
      {row.newName !== null && (
        <NewNameField
          key={row.ingredientId}
          name={row.newName}
          hint='New ingredient. It’s added when you save the recipe, and you can rename it until then.'
          usedIds={usedInGroup}
          onRename={(name, isFinal) =>
            onRename(row.ingredientId, name, isFinal)
          }
          onUseExisting={(toId) => onUseExisting(row.ingredientId, toId)}
        />
      )}
      {row.isAmountless ? (
        <div className='space-y-1.5'>
          <p className='font-medium'>Amount</p>
          <div className='flex min-h-10 flex-wrap items-center gap-x-3'>
            <span className='text-muted-foreground'>No amount</span>
            <RevealChip
              icon={<Plus className='h-4 w-4' aria-hidden='true' />}
              onClick={() => {
                setIsAmountJustAdded(true);
                onUpdate({
                  isAmountless: false,
                  amount: '',
                  unit: servingUnit ?? row.unit,
                });
              }}
            >
              Add an amount
            </RevealChip>
          </div>
        </div>
      ) : (
        <div className='space-y-3'>
          <div className='grid grid-cols-2 gap-3'>
            <Field label='Amount'>
              {(id) => (
                <Input
                  id={id}
                  type='number'
                  inputMode='decimal'
                  min={0}
                  step='any'
                  variant='outline'
                  autoFocus={isAmountJustAdded}
                  value={row.amount}
                  onChange={(event) => onUpdate({ amount: event.target.value })}
                />
              )}
            </Field>
            <div className='space-y-1.5'>
              <p className='font-medium'>Unit</p>
              <UnitSelect
                value={row.unit}
                onChange={(unit) => onUpdate({ unit })}
              />
            </div>
          </div>
          <RevealChip
            onClick={() => {
              onUpdate({ isAmountless: true, amount: '' });
              if (!row.note) noteRef.current?.focus();
            }}
          >
            No amount (to taste, a handful…)
          </RevealChip>
        </div>
      )}
      <Field label='Detail'>
        {(id) => (
          <Input
            id={id}
            ref={noteRef}
            variant='outline'
            placeholder={
              row.isAmountless
                ? 'to taste, a handful…'
                : 'diced, room temperature…'
            }
            maxLength={MAX_NOTE_LENGTH}
            value={row.note ?? ''}
            onChange={(event) =>
              onUpdate({
                note: event.target.value === '' ? null : event.target.value,
              })
            }
          />
        )}
      </Field>
      <GroupField
        group={row.group}
        names={groupNames}
        onChange={(group) => onUpdate({ group })}
      />
      {showRemove && (
        <ActionRow
          isDestructive
          icon={<Trash2 className='h-4 w-4' />}
          label='Remove from this recipe'
          onClick={onRemove}
        />
      )}
    </div>
  );
}

interface GroupEditorBodyProps {
  draft: string;
  /** The other groups' names: typing one of them makes the two one group. */
  otherNames: string[];
  lineCount: number;
  focusDelay: number;
  onDraftChange: (draft: string) => void;
  onDone: () => void;
  onRemove: () => void;
}

function GroupEditorBody({
  draft,
  otherNames,
  lineCount,
  focusDelay,
  onDraftChange,
  onDone,
  onRemove,
}: GroupEditorBodyProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const isMerge = otherNames.some(
    (name) => getGroupKey(name) === getGroupKey(draft),
  );

  useEffect(() => {
    const timer = window.setTimeout(
      () => bodyRef.current?.querySelector('input')?.focus(),
      focusDelay,
    );
    return () => window.clearTimeout(timer);
  }, [focusDelay]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      onDone();
    }
  };

  return (
    <div ref={bodyRef} className='space-y-3' onKeyDown={handleKeyDown}>
      <Field label='Name'>
        {(id) => (
          <Input
            id={id}
            variant='outline'
            value={draft}
            maxLength={MAX_INGREDIENT_GROUP_LENGTH}
            onChange={(event) => onDraftChange(event.target.value)}
          />
        )}
      </Field>
      {isMerge && (
        <p className='text-muted-foreground text-xs'>
          Another group has this name, so the two become one.
        </p>
      )}
      <ActionRow
        isDestructive
        icon={<Ungroup className='h-4 w-4' />}
        label='Remove the group'
        subtitle={
          lineCount === 1
            ? 'Its ingredient stays, with no group.'
            : `Its ${lineCount} ingredients stay, with no group.`
        }
        onClick={onRemove}
      />
    </div>
  );
}

interface GroupHeadingProps {
  name: string;
  otherNames: string[];
  lineCount: number;
  onRename: (name: string) => void;
  onRemove: () => void;
}

/** Closing the editor keeps the typed name. */
function GroupHeading({
  name,
  otherNames,
  lineCount,
  onRename,
  onRemove,
}: GroupHeadingProps) {
  const isPhone = useMediaQuery().isBelow('sm');
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(name);
  const close = () => {
    setIsOpen(false);
    const cleaned = cleanGroupName(draft);
    if (cleaned !== null && cleaned !== name) {
      onRename(cleaned);
      return;
    }
    focusGroupHeading(name);
  };
  const remove = () => {
    setIsOpen(false);
    onRemove();
  };
  const body = (
    <GroupEditorBody
      draft={draft}
      otherNames={otherNames}
      lineCount={lineCount}
      focusDelay={isPhone ? PHONE_FOCUS_DELAY_MS : DESKTOP_FOCUS_DELAY_MS}
      onDraftChange={setDraft}
      onDone={close}
      onRemove={remove}
    />
  );
  const trigger = (
    <Button
      type='button'
      variant='tertiary'
      size='sm'
      aria-haspopup='dialog'
      aria-expanded={isOpen}
      aria-label={`${name}: rename or remove the group`}
      data-group-heading={getGroupKey(name)}
      className='text-muted-foreground! h-10 max-w-full gap-1.5 px-2 text-sm font-medium'
      onClick={() => {
        if (isOpen) {
          close();
          return;
        }
        setDraft(name);
        setIsOpen(true);
      }}
    >
      <span className='min-w-0 wrap-break-word whitespace-normal'>{name}</span>
      <Pencil className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
    </Button>
  );

  if (isPhone) {
    return (
      <>
        <SectionDivider label={trigger} className='pt-2' />
        {isOpen && (
          <DetailSheet
            isOpen
            onClose={close}
            title='Group'
            footer={
              <div className='px-4 pb-4'>
                <Button type='button' className='w-full' onClick={close}>
                  Done
                </Button>
              </div>
            }
          >
            {body}
          </DetailSheet>
        )}
      </>
    );
  }

  return (
    <SectionDivider
      className='pt-2'
      label={
        <Popover
          trigger={trigger}
          isOpen={isOpen}
          onOpenChange={(next) => (next ? setIsOpen(true) : close())}
          placement='bottom'
          alignment='center'
          className='w-[min(22rem,calc(100vw-2rem))] p-4'
        >
          {isOpen && (
            <div className='space-y-3'>
              <h3 className='text-sm font-semibold'>Group</h3>
              {body}
              <Button type='button' className='w-full' onClick={close}>
                Done
              </Button>
            </div>
          )}
        </Popover>
      }
    />
  );
}

type SheetMode =
  { kind: 'add'; group: string | null } | { kind: 'edit'; id: string };

interface RecipeIngredientsProps {
  uid: string;
  rows: IngredientRow[];
  onChange: (rows: IngredientRow[]) => void;
  /** Called with what a removal says and how to take it back. */
  onRemoved: (message: string, restore: () => void) => void;
}

/** A new line joins the last group, the one just above the add button, and "Add another" keeps the group of the line before. */
function RecipeIngredients({
  uid,
  rows,
  onChange,
  onRemoved,
}: RecipeIngredientsProps) {
  const latest = useRef({ rows, onChange });
  useEffect(() => {
    latest.current = { rows, onChange };
  });
  const ingredientsById = useAppSelector(selectIngredientsById);
  const [sheet, setSheet] = useState<SheetMode | null>(null);
  const oftenUsedIds = useAppSelector(selectOftenUsedIngredientIds);
  const usedKey = rows.map((row) => row.ingredientId).join(',');
  const suggestions = useMemo<ItemSuggestions>(
    () => ({
      caption: 'From your other recipes',
      ids: takeSuggestionIds([oftenUsedIds], new Set(usedKey.split(','))),
    }),
    [oftenUsedIds, usedKey],
  );
  const groups = groupIngredientLines(rows);
  const groupNames = getGroupNames(rows);
  const lastGroup = rows[rows.length - 1]?.group ?? null;

  const getName = (row: IngredientRow) =>
    ingredientsById.get(row.ingredientId)?.name ??
    row.newName ??
    row.proposedName ??
    'Removed ingredient';
  const update = (id: string, patch: Partial<IngredientRow>) => {
    const row = rows.find((candidate) => candidate.id === id);
    if (!row) return;
    if (!('group' in patch)) {
      onChange(
        rows.map((candidate) =>
          candidate.id === id ? { ...candidate, ...patch } : candidate,
        ),
      );
      return;
    }
    const others = rows.filter((candidate) => candidate.id !== id);
    const group = resolveGroupName(patch.group, others);
    onChange(placeLineInGroup(rows, { ...row, ...patch, group }));
  };
  const remove = (id: string) => {
    const index = rows.findIndex((candidate) => candidate.id === id);
    if (index < 0) {
      return;
    }
    const removed = rows[index];
    onChange(rows.filter((candidate) => candidate.id !== id));
    onRemoved(`Removed ${getName(removed)}`, () =>
      latest.current.onChange(
        orderIngredientLines([
          ...latest.current.rows.slice(0, index),
          removed,
          ...latest.current.rows.slice(index),
        ]),
      ),
    );
  };
  const removeGroup = (name: string) => {
    const before = rows;
    onChange(ungroupLines(rows, name));
    onRemoved(`Removed the group “${name}”`, () =>
      latest.current.onChange(
        restoreLineGroup(latest.current.rows, before, name),
      ),
    );
  };

  const addRow = (
    ingredientId: string,
    group: string | null,
    newName: string | null = null,
  ) => {
    const serving =
      ingredientsById.get(ingredientId)?.serving ?? DEFAULT_SERVING;
    const id = generateUuid();
    onChange(
      placeLineInGroup(rows, {
        id,
        ingredientId,
        amount: String(serving.amount),
        unit: serving.unit,
        isAmountless: false,
        note: null,
        proposedName: null,
        newName,
        group: resolveGroupName(group, rows),
      }),
    );
    return id;
  };
  const stageNew = (name: string, group: string | null) => {
    const ingredientId = getStagedId(rows, name);
    const sameLine = rows.find(
      (row) =>
        row.ingredientId === ingredientId &&
        row.newName !== null &&
        getGroupKey(row.group) === getGroupKey(resolveGroupName(group, rows)),
    );

    return sameLine ? sameLine.id : addRow(ingredientId, group, name);
  };
  const renameNew = (ingredientId: string, name: string, isFinal: boolean) => {
    const other = isFinal
      ? rows.find(
          (row) =>
            row.newName !== null &&
            row.ingredientId !== ingredientId &&
            normalizeName(row.newName) === normalizeName(name),
        )
      : undefined;
    onChange(
      rows.map((row) =>
        row.ingredientId === ingredientId && row.newName !== null
          ? {
              ...row,
              ingredientId: other?.ingredientId ?? row.ingredientId,
              newName: other?.newName ?? name,
            }
          : row,
      ),
    );
  };
  const useExisting = (fromId: string, toId: string) =>
    onChange(
      rows.map((row) =>
        row.ingredientId === fromId && row.newName !== null
          ? { ...row, ingredientId: toId, newName: null, proposedName: null }
          : row,
      ),
    );

  return (
    <div className='space-y-3' data-recipe-ingredients>
      {rows.length > 0 && (
        <div>
          {groups.map((group) => (
            <div key={group.key}>
              {group.name !== null && (
                <GroupHeading
                  key={group.name}
                  name={group.name}
                  otherNames={groupNames.filter((name) => name !== group.name)}
                  lineCount={group.lines.length}
                  onRename={(name) => {
                    const renamed = renameLineGroup(
                      rows,
                      group.name ?? '',
                      name,
                    );
                    onChange(renamed);
                    focusGroupHeading(
                      renamed.find(
                        (row) => getGroupKey(row.group) === getGroupKey(name),
                      )?.group ?? name,
                    );
                  }}
                  onRemove={() => removeGroup(group.name ?? '')}
                />
              )}
              <ul className='divide-border divide-y'>
                {group.lines.map((row) => {
                  const name = getName(row);
                  const label = getAmountLabel(row);
                  const isUnresolved = row.ingredientId === '';
                  return (
                    <li
                      key={row.id}
                      className='scroll-mt-16 scroll-mb-28 py-1'
                      data-ingredient-row={row.id}
                      data-ingredient-unresolved={isUnresolved || undefined}
                      data-ingredient-amount-wrong={
                        (!isUnresolved && !isRowAmountValid(row)) || undefined
                      }
                    >
                      <div className='flex items-center gap-1'>
                        <Button
                          type='button'
                          variant='tertiary'
                          aria-haspopup='dialog'
                          aria-label={`${name}, ${isUnresolved ? 'choose an ingredient' : row.newName !== null ? `new ingredient, ${label || 'no amount'}` : label || 'no amount'}`}
                          onClick={() => setSheet({ kind: 'edit', id: row.id })}
                          className='h-auto min-h-12 min-w-0 flex-1 justify-start gap-3 px-0! py-1.5 text-left'
                        >
                          <span className='min-w-0 flex-1'>
                            <span className='flex min-w-0 items-center gap-2'>
                              <span className='line-clamp-2 font-medium break-words'>
                                {name}
                              </span>
                              {(isUnresolved || row.newName !== null) && (
                                <LabelChip isDashed={isUnresolved}>
                                  {isUnresolved ? 'Choose' : 'New'}
                                </LabelChip>
                              )}
                            </span>
                            {row.note && !row.isAmountless && (
                              <span className='text-muted-foreground block truncate text-xs font-normal'>
                                {row.note}
                              </span>
                            )}
                          </span>
                          {label !== '' && (
                            <span
                              className={join(
                                'text-sm font-normal',
                                row.isAmountless
                                  ? 'max-w-[50%] truncate'
                                  : 'shrink-0 whitespace-nowrap',
                                isRowAmountValid(row)
                                  ? 'text-muted-foreground'
                                  : 'text-destructive',
                              )}
                            >
                              {label}
                            </span>
                          )}
                        </Button>
                        <Button
                          type='button'
                          variant='tertiary'
                          size='icon'
                          aria-label={`Remove ${name}`}
                          className='size-10 shrink-0'
                          onClick={() => remove(row.id)}
                        >
                          <X className='h-4 w-4' aria-hidden='true' />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
      {rows.length < MAX_RECIPE_INGREDIENTS && (
        <Button
          type='button'
          variant='secondary'
          rounded='full'
          className='gap-1.5'
          onClick={() => setSheet({ kind: 'add', group: lastGroup })}
        >
          <Plus className='h-4 w-4' aria-hidden='true' />
          Add ingredient
        </Button>
      )}
      {rows.length >= MAX_RECIPE_INGREDIENTS && (
        <p className='text-muted-foreground text-sm'>
          A recipe holds up to {MAX_RECIPE_INGREDIENTS} ingredients.
        </p>
      )}
      {sheet && (
        <IngredientSheet
          key={sheet.kind === 'edit' ? sheet.id : 'add'}
          uid={uid}
          rows={rows}
          mode={sheet}
          getName={getName}
          suggestions={suggestions}
          onAdd={addRow}
          onStageNew={stageNew}
          onUpdate={update}
          onRemove={remove}
          onRename={renameNew}
          onUseExisting={useExisting}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}

interface IngredientSheetProps {
  uid: string;
  rows: IngredientRow[];
  mode: SheetMode;
  getName: (row: IngredientRow) => string;
  suggestions: ItemSuggestions;
  onAdd: (ingredientId: string, group: string | null) => string;
  onStageNew: (name: string, group: string | null) => string;
  onUpdate: (id: string, patch: Partial<IngredientRow>) => void;
  onRemove: (id: string) => void;
  onRename: (ingredientId: string, name: string, isFinal: boolean) => void;
  onUseExisting: (fromId: string, toId: string) => void;
  onClose: () => void;
}

function IngredientSheet({
  uid,
  rows,
  mode,
  getName,
  suggestions,
  onAdd,
  onStageNew,
  onUpdate,
  onRemove,
  onRename,
  onUseExisting,
  onClose,
}: IngredientSheetProps) {
  const [activeId, setActiveId] = useState<string | null>(
    mode.kind === 'edit' ? mode.id : null,
  );
  const [addGroup, setAddGroup] = useState(
    mode.kind === 'add' ? mode.group : null,
  );
  const row = rows.find((candidate) => candidate.id === activeId) ?? null;
  const isPhone = useMediaQuery().isBelow('sm');
  const addAnother = () => {
    if (!row) return;
    setAddGroup(row.group);
    setActiveId(null);
  };
  const getFooter = () => {
    if (!row) return undefined;
    const isUnresolved = row.ingredientId === '';
    const addAsNew = isUnresolved && (
      <Button
        type='button'
        className={join(isPhone && 'w-full')}
        disabled={toTypedIngredientName(row.proposedName ?? '') === ''}
        onClick={() => onUpdate(row.id, getStagedPatch(rows, row))}
      >
        Add as new ingredient
      </Button>
    );
    const done = (
      <Button
        type='button'
        variant={isUnresolved ? 'secondary' : 'primary'}
        className={join(isPhone && 'w-full')}
        onClick={onClose}
      >
        Done
      </Button>
    );
    const another = mode.kind === 'add' && (
      <Button
        type='button'
        variant='secondary'
        className={join(isPhone && 'w-full')}
        onClick={addAnother}
      >
        Add another
      </Button>
    );
    return (
      <div className='px-4 pb-4'>
        {isPhone ? (
          <div className='space-y-2'>
            {addAsNew}
            {done}
            {another}
          </div>
        ) : (
          <ModalFooterActions
            rightActions={
              <>
                {another}
                {done}
                {addAsNew}
              </>
            }
          />
        )}
      </div>
    );
  };

  return (
    <DetailSheet
      isOpen
      onClose={onClose}
      title={row ? getName(row) : 'Ingredient'}
      footer={getFooter()}
    >
      {row ? (
        <IngredientEditor
          key={row.id}
          uid={uid}
          row={row}
          rows={rows}
          showRemove={mode.kind === 'edit'}
          onUpdate={(patch) => onUpdate(row.id, patch)}
          onRemove={() => {
            onRemove(row.id);
            onClose();
          }}
          onRename={onRename}
          onUseExisting={onUseExisting}
        />
      ) : (
        <div className='space-y-3'>
          <p className='text-muted-foreground text-sm'>
            {addGroup === null
              ? 'Search your ingredients, or type a new one.'
              : `Search your ingredients, or type a new one. It goes under “${addGroup}”, and you can move it.`}
          </p>
          <ItemSearch
            uid={uid}
            autoFocus
            isCapped
            excludeIds={getUsedInGroup(rows, addGroup)}
            suggestions={suggestions}
            onPick={(ingredientId) =>
              setActiveId(onAdd(ingredientId, addGroup))
            }
            onStageNew={(name) => setActiveId(onStageNew(name, addGroup))}
          />
        </div>
      )}
    </DetailSheet>
  );
}

export default RecipeIngredients;
