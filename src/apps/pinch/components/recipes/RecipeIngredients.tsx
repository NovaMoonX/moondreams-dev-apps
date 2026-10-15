import { useEffect, useMemo, useRef, useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Plus, X } from 'lucide-react';

import DetailSheet from '@/components/DetailSheet';
import Field from '@/components/forms/Field';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useAppSelector } from '@/store';
import { generateUuid } from '@/utils';
import { blockEnterSubmit } from '@/utils/formKeyUtils';
import ItemSearch from '@apps/pinch/components/plan/ItemSearch';
import {
  isRowAmountValid,
  type IngredientRow,
} from '@apps/pinch/components/recipes/recipeFormModel';
import UnitSelect from '@apps/pinch/components/shared/UnitSelect';
import {
  DEFAULT_SERVING,
  MAX_NOTE_LENGTH,
  MAX_RECIPE_INGREDIENTS,
  UNIT_LABELS,
} from '@apps/pinch/constants';
import {
  selectIngredients,
  selectIngredientsById,
} from '@apps/pinch/store/selectors';
import { findNearMatches } from '@apps/pinch/utils/catalogSearch';
import { normalizeName } from '@apps/pinch/utils/ingredientMatch';

const getAmountLabel = (row: IngredientRow) => {
  if (row.isAmountless) return row.note ?? '';
  if (isRowAmountValid(row)) {
    return `${Math.round(Number(row.amount) * 100) / 100} ${UNIT_LABELS[row.unit]}`;
  }
  return row.amount.trim() === '' ? 'Add an amount' : 'Check the amount';
};

interface IngredientEditorProps {
  uid: string;
  row: IngredientRow;
  rows: IngredientRow[];
  displayName: string;
  onUpdate: (patch: Partial<IngredientRow>) => void;
  onRemove: () => void;
  /** The drawer has a footer button and puts "remove" in its body; an inline row shows it beside the fields. */
  showRemove: boolean;
}

/** One ingredient's details: amount, unit and a preparation note, or the way to resolve a name the reader found that no ingredient matches. Shared by the phone drawer and the inline row. */
function IngredientEditor({
  uid,
  row,
  rows,
  displayName,
  onUpdate,
  onRemove,
  showRemove,
}: IngredientEditorProps) {
  const [isChoosing, setIsChoosing] = useState(false);
  const [isAmountJustAdded, setIsAmountJustAdded] = useState(false);
  const noteRef = useRef<HTMLInputElement>(null);
  const ingredients = useAppSelector(selectIngredients);
  const servingUnit = useAppSelector(selectIngredientsById).get(
    row.ingredientId,
  )?.serving.unit;
  const isUnresolved = row.ingredientId === '';
  const proposedName = row.proposedName ?? '';
  const usedIds = rows.map((candidate) => candidate.ingredientId).join(',');
  const nearMatches = useMemo(() => {
    if (!isUnresolved) return [];
    const used = new Set(usedIds.split(','));
    const result = findNearMatches(
      ingredients.filter((ingredient) => !used.has(ingredient.id)),
      proposedName,
    );
    return result;
  }, [isUnresolved, ingredients, proposedName, usedIds]);

  if (isUnresolved) {
    return (
      <div className='space-y-3'>
        <p className='text-muted-foreground text-sm'>
          <span className='text-foreground font-medium'>{displayName}</span>{' '}
          isn’t in your ingredients yet.
        </p>
        {nearMatches.length > 0 && (
          <div className='space-y-1.5'>
            <p className='text-muted-foreground text-xs'>
              Did you mean one of these?
            </p>
            <div className='flex flex-wrap gap-x-2 gap-y-3'>
              {nearMatches.map((ingredient) => (
                <Button
                  key={ingredient.id}
                  type='button'
                  size='sm'
                  rounded='full'
                  variant='secondary'
                  className="relative after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']"
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
              ))}
            </div>
          </div>
        )}
        <div className='flex flex-wrap gap-x-2 gap-y-3'>
          <Button
            type='button'
            size='sm'
            rounded='full'
            variant='secondary'
            className="relative after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']"
            onClick={() =>
              onUpdate({
                ingredientId:
                  rows.find(
                    (other) =>
                      other.newName !== null &&
                      normalizeName(other.newName) ===
                        normalizeName(row.proposedName ?? ''),
                  )?.ingredientId ?? generateUuid(),
                newName: row.proposedName,
              })
            }
          >
            Add as new ingredient
          </Button>
          <Button
            type='button'
            size='sm'
            rounded='full'
            variant='secondary'
            className="relative after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']"
            onClick={() => setIsChoosing((current) => !current)}
          >
            {isChoosing ? 'Close' : 'Pick from your ingredients'}
          </Button>
        </div>
        {isChoosing && (
          <ItemSearch
            uid={uid}
            excludeIds={rows.map((candidate) => candidate.ingredientId)}
            onPick={(ingredientId) => {
              setIsChoosing(false);
              onUpdate({ ingredientId, proposedName: null, newName: null });
            }}
          />
        )}
        {showRemove && (
          <Button
            type='button'
            variant='tertiary'
            className='text-destructive! h-10 w-full'
            onClick={onRemove}
          >
            Remove from this recipe
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className='space-y-3' onKeyDown={blockEnterSubmit}>
      {row.isAmountless ? (
        <div className='space-y-1.5'>
          <p className='font-medium'>Amount</p>
          <div className='flex min-h-10 flex-wrap items-center gap-x-3'>
            <span className='text-muted-foreground'>No amount</span>
            <Button
              type='button'
              variant='link'
              size='sm'
              className='h-10 px-0!'
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
            </Button>
          </div>
        </div>
      ) : (
        <div className='space-y-1'>
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
              <p className='text-sm font-medium'>Unit</p>
              <UnitSelect
                value={row.unit}
                onChange={(unit) => onUpdate({ unit })}
              />
            </div>
          </div>
          <Button
            type='button'
            variant='link'
            size='sm'
            className='h-10 px-0!'
            onClick={() => {
              onUpdate({ isAmountless: true, amount: '' });
              if (!row.note) noteRef.current?.focus();
            }}
          >
            No amount (to taste, a handful…)
          </Button>
        </div>
      )}
      <Field label='Note'>
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
      {showRemove && (
        <Button
          type='button'
          variant='tertiary'
          className='text-destructive! h-10 w-full'
          onClick={onRemove}
        >
          Remove from this recipe
        </Button>
      )}
    </div>
  );
}

type DrawerMode = { kind: 'add' } | { kind: 'edit'; id: string };

interface RecipeIngredientsProps {
  uid: string;
  rows: IngredientRow[];
  onChange: (rows: IngredientRow[]) => void;
  /** Called with what a removal says and how to take it back. */
  onRemoved: (message: string, restore: () => void) => void;
}

/** The recipe's ingredient lines as one-line summaries. On a phone adding and editing happen in a drawer that never leaves the form; from `sm` up a row opens its fields in place. */
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
  const isPhone = useMediaQuery().isBelow('sm');
  const [openId, setOpenId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(rows.length === 0 && !isPhone);
  const [drawer, setDrawer] = useState<DrawerMode | null>(null);

  const getName = (row: IngredientRow) =>
    ingredientsById.get(row.ingredientId)?.name ??
    row.newName ??
    row.proposedName ??
    'Removed ingredient';
  const update = (id: string, patch: Partial<IngredientRow>) =>
    onChange(
      rows.map((candidate) =>
        candidate.id === id ? { ...candidate, ...patch } : candidate,
      ),
    );
  const remove = (id: string) => {
    const index = rows.findIndex((candidate) => candidate.id === id);
    if (index < 0) {
      return;
    }
    const removed = rows[index];
    onChange(rows.filter((candidate) => candidate.id !== id));
    onRemoved(`Removed ${getName(removed)}`, () =>
      latest.current.onChange([
        ...latest.current.rows.slice(0, index),
        removed,
        ...latest.current.rows.slice(index),
      ]),
    );
  };

  const addRow = (ingredientId: string) => {
    const serving =
      ingredientsById.get(ingredientId)?.serving ?? DEFAULT_SERVING;
    const id = generateUuid();
    onChange([
      ...rows,
      {
        id,
        ingredientId,
        amount: String(serving.amount),
        unit: serving.unit,
        isAmountless: false,
        note: null,
        proposedName: null,
        newName: null,
      },
    ]);
    return id;
  };

  return (
    <div className='space-y-3' data-recipe-ingredients>
      {rows.length > 0 && (
        <ul className='divide-border divide-y'>
          {rows.map((row) => {
            const name = getName(row);
            const label = getAmountLabel(row);
            const isUnresolved = row.ingredientId === '';
            return (
              <li
                key={row.id}
                className='py-1'
                data-ingredient-unresolved={isUnresolved || undefined}
                data-ingredient-amount-wrong={
                  (!isUnresolved && !isRowAmountValid(row)) || undefined
                }
              >
                <div className='flex items-center gap-1'>
                  <Button
                    type='button'
                    variant='tertiary'
                    aria-expanded={isPhone ? undefined : openId === row.id}
                    aria-label={`${name}, ${isUnresolved ? 'not in your ingredients yet' : label || 'no amount'}`}
                    onClick={() => {
                      if (isPhone) {
                        setDrawer({ kind: 'edit', id: row.id });
                        return;
                      }
                      setOpenId((current) =>
                        current === row.id ? null : row.id,
                      );
                    }}
                    className='h-auto min-h-12 min-w-0 flex-1 justify-start gap-3 px-0! py-1.5 text-left'
                  >
                    <span className='min-w-0 flex-1'>
                      <span className='block truncate font-medium'>
                        {name}
                        {row.newName && (
                          <span className='text-muted-foreground ml-1.5 text-xs font-normal'>
                            new
                          </span>
                        )}
                      </span>
                      {((row.note && !row.isAmountless) || isUnresolved) && (
                        <span className='text-muted-foreground block truncate text-xs font-normal'>
                          {isUnresolved
                            ? 'Not in your ingredients yet · tap to add or choose'
                            : row.note}
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
                {!isPhone && openId === row.id && (
                  <div className='pb-3'>
                    <IngredientEditor
                      uid={uid}
                      row={row}
                      rows={rows}
                      displayName={name}
                      showRemove={false}
                      onUpdate={(patch) => update(row.id, patch)}
                      onRemove={() => remove(row.id)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!isPhone && isAdding ? (
        <ItemSearch
          uid={uid}
          onPick={(ingredientId) => {
            setOpenId(addRow(ingredientId));
            setIsAdding(false);
          }}
          excludeIds={rows.map((row) => row.ingredientId)}
          autoFocus={rows.length > 0}
        />
      ) : (
        rows.length < MAX_RECIPE_INGREDIENTS && (
          <Button
            type='button'
            variant='secondary'
            rounded='full'
            className='gap-1.5'
            onClick={() =>
              isPhone ? setDrawer({ kind: 'add' }) : setIsAdding(true)
            }
          >
            <Plus className='h-4 w-4' aria-hidden='true' />
            Add ingredient
          </Button>
        )
      )}
      {rows.length >= MAX_RECIPE_INGREDIENTS && (
        <p className='text-muted-foreground text-sm'>
          A recipe holds up to {MAX_RECIPE_INGREDIENTS} ingredients.
        </p>
      )}
      {isPhone && drawer && (
        <IngredientDrawer
          key={drawer.kind === 'edit' ? drawer.id : 'add'}
          uid={uid}
          rows={rows}
          mode={drawer}
          getName={getName}
          onAdd={addRow}
          onUpdate={update}
          onRemove={remove}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  );
}

interface IngredientDrawerProps {
  uid: string;
  rows: IngredientRow[];
  mode: DrawerMode;
  getName: (row: IngredientRow) => string;
  onAdd: (ingredientId: string) => string;
  onUpdate: (id: string, patch: Partial<IngredientRow>) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

/** Picks an ingredient and sets its amount without leaving the recipe: search, then the details of what was picked, then "Add another" or Done. */
function IngredientDrawer({
  uid,
  rows,
  mode,
  getName,
  onAdd,
  onUpdate,
  onRemove,
  onClose,
}: IngredientDrawerProps) {
  const [activeId, setActiveId] = useState<string | null>(
    mode.kind === 'edit' ? mode.id : null,
  );
  const row = rows.find((candidate) => candidate.id === activeId) ?? null;

  return (
    <DetailSheet
      isOpen
      onClose={onClose}
      title={row ? getName(row) : 'Ingredient'}
      footer={
        row && (
          <div className='space-y-2 px-4 pb-4'>
            <Button type='button' className='w-full' onClick={onClose}>
              Done
            </Button>
            {mode.kind === 'add' && (
              <Button
                type='button'
                variant='secondary'
                className='w-full'
                onClick={() => setActiveId(null)}
              >
                Add another
              </Button>
            )}
          </div>
        )
      }
    >
      {row ? (
        <IngredientEditor
          uid={uid}
          row={row}
          rows={rows}
          displayName={getName(row)}
          showRemove={mode.kind === 'edit'}
          onUpdate={(patch) => onUpdate(row.id, patch)}
          onRemove={() => {
            onRemove(row.id);
            onClose();
          }}
        />
      ) : (
        <div className='space-y-3'>
          <p className='text-muted-foreground text-sm'>
            Search your ingredients, or type a new one.
          </p>
          <ItemSearch
            uid={uid}
            autoFocus
            excludeIds={rows.map((candidate) => candidate.ingredientId)}
            onPick={(ingredientId) => setActiveId(onAdd(ingredientId))}
          />
        </div>
      )}
    </DetailSheet>
  );
}

export default RecipeIngredients;
