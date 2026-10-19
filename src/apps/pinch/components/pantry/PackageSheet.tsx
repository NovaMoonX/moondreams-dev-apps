import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import {
  Ban,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  History,
  PencilLine,
  Plus,
  Scale,
} from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import DeleteIconButton from '@/components/DeleteIconButton';
import FormSection from '@/components/FormSection';
import FormSheet from '@/components/FormSheet';
import GroupRow from '@/components/GroupRow';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import RevealChip from '@/components/RevealChip';
import { COMPACT_INPUT_CLASS } from '@/components/forms/Field';
import { useBackStep } from '@/hooks/useBackHistory';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateShort, formatTime } from '@/utils/formatUtils';
import EatByBadge from '@apps/pinch/components/containers/EatByBadge';
import PackageDateField from '@apps/pinch/components/pantry/PackageDateField';
import {
  PACKAGE_PLACE_EMOJIS,
  PACKAGE_PLACE_LABELS,
  PACKAGE_PLACES,
  UNIT_LABELS,
} from '@apps/pinch/constants';
import { usePackageActions } from '@apps/pinch/hooks/usePackageActions';
import {
  selectIngredientsById,
  selectLeadDays,
  selectPackagesById,
  selectPackagesByIngredient,
  selectRecipes,
} from '@apps/pinch/store/selectors';
import type { Package, PackagePlace } from '@apps/pinch/types';
import {
  getAnswerDate,
  getDateAnswer,
  getOpenedDays,
  getPackageEventText,
  getPackageLabel,
  getPackageState,
  getPlaceText,
  getStockSummaryParts,
  getStockView,
  getUseItUpRecipes,
  getUseItUpText,
  isValidPackageAmount,
  lowerFirst,
  parseAmountText,
  round2,
  type DateAnswer,
} from '@apps/pinch/utils/packages';
import { formatSize } from '@apps/pinch/utils/productFormat';
import PackageRow from '@apps/pinch/components/pantry/PackageRow';

type SheetView =
  | { kind: 'list' }
  | { kind: 'package' }
  | { kind: 'use' }
  | { kind: 'move' }
  | { kind: 'history' }
  | { kind: 'recipes' };

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

function ErrorLine({ error }: { error: string | null }) {
  if (error === null) return null;

  return (
    <p className='text-destructive text-sm' role='alert'>
      {error}
    </p>
  );
}

interface ViewProps {
  uid: string;
  pkg: Package;
  name: string;
  onBack: () => void;
  onDone: () => void;
}

function UseView({ uid, pkg, name, onBack, onDone }: ViewProps) {
  const { consume } = usePackageActions(uid);
  const [text, setText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amount = parseAmountText(text);
  const isNumber = isValidPackageAmount(amount);
  const isAll = isNumber && amount >= pkg.amount - 0.005;
  const isOver = isNumber && amount > pkg.amount + 0.005;
  const left = isNumber && !isOver ? pkg.amount - amount : null;

  const getLine = () => {
    if (isOver) {
      return `Only ${formatSize(pkg.amount, pkg.unit)} is left.`;
    }
    if (isAll) return 'That uses it up, so it leaves your pantry.';
    return left === null
      ? `${formatSize(pkg.amount, pkg.unit)} left now.`
      : `Leaves ${formatSize(left, pkg.unit)}.`;
  };

  const handleSave = async () => {
    if (!isNumber || isOver || isSaving) return;

    setError(null);
    setIsSaving(true);
    try {
      const finished = await consume(pkg, isAll ? 'ALL' : amount, name);
      if (finished === true) {
        onDone();
        return;
      }
      if (finished === false) onBack();
      setIsSaving(false);
    } catch (useError) {
      setError(getErrorMessage(useError, 'Unable to save this.'));
      setIsSaving(false);
    }
  };

  return (
    <div className='grid gap-4'>
      <BackLink onClick={onBack} />
      <div className='space-y-1'>
        <p className='font-medium'>How much did you use?</p>
        <p className='text-muted-foreground text-sm'>
          {formatSize(pkg.amount, pkg.unit)} left now.
        </p>
      </div>
      <div className='space-y-2'>
        <div className='flex items-center gap-2'>
          <Input
            type='number'
            inputMode='decimal'
            min={0}
            step='any'
            variant='outline'
            aria-label={`Amount of ${name} used`}
            placeholder='0.5'
            className={join(COMPACT_INPUT_CLASS, 'min-w-0')}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <span className='text-muted-foreground w-24 shrink-0 text-sm'>
            {UNIT_LABELS[pkg.unit]}
          </span>
        </div>
        <div className='flex flex-wrap gap-2'>
          <RevealChip
            onClick={() => setText(String(Math.round(pkg.amount * 50) / 100))}
          >
            Half
          </RevealChip>
          <RevealChip onClick={() => setText(String(round2(pkg.amount)))}>
            All of it
          </RevealChip>
        </div>
        <p className='text-muted-foreground text-sm' role='status'>
          {getLine()}
        </p>
      </div>
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
            disabled={isSaving || !isNumber || isOver}
            onClick={() => void handleSave()}
          >
            {isAll ? 'Used it up' : 'Used some'}
          </Button>
        }
      />
    </div>
  );
}

function MoveView({ uid, pkg, name, onBack, onDone }: ViewProps) {
  const { move } = usePackageActions(uid);
  const [to, setTo] = useState<PackagePlace | null>(null);
  const [date, setDate] = useState<DateAnswer | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answer = date === null ? null : getAnswerDate(date);
  const isDateChosen = answer !== null && answer.isAnswered;
  const current = getPackageLabel(pkg.expiresAt);

  const handleMove = async () => {
    if (to === null || isSaving || (date !== null && !isDateChosen)) return;

    setError(null);
    setIsSaving(true);
    try {
      await move(pkg, to, name, isDateChosen ? answer.expiresAt : undefined);
      onDone();
    } catch (moveError) {
      setError(getErrorMessage(moveError, 'Unable to save this.'));
      setIsSaving(false);
    }
  };

  return (
    <div className='grid gap-4'>
      <BackLink onClick={onBack} />
      <div className='space-y-1'>
        <p className='font-medium'>Move it</p>
        <p className='text-muted-foreground text-sm'>
          The whole package goes. It keeps its amount.
        </p>
      </div>
      <PillGroup
        label='Where it goes'
        options={PACKAGE_PLACES.filter((place) => place !== pkg.place).map(
          (place) => ({
            value: place,
            label: PACKAGE_PLACE_LABELS[place],
            emoji: PACKAGE_PLACE_EMOJIS[place],
          }),
        )}
        value={to}
        onChange={setTo}
      />
      {date === null ? (
        <div className='space-y-2'>
          <p className='text-muted-foreground text-sm'>
            {current === null
              ? 'It has no date.'
              : `It keeps its date: ${lowerFirst(current)}.`}{' '}
            Moving it doesn&rsquo;t change what the package says.
          </p>
          <div className='flex'>
            <RevealChip
              icon={<PencilLine className='h-4 w-4' aria-hidden='true' />}
              onClick={() => setDate(getDateAnswer(pkg.expiresAt))}
            >
              Change the date
            </RevealChip>
          </div>
        </div>
      ) : (
        <PackageDateField value={date} onChange={setDate} />
      )}
      <ErrorLine error={error} />
      <ModalFooterActions
        note={to === null ? 'Pick where it goes.' : null}
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
            disabled={
              isSaving || to === null || (date !== null && !isDateChosen)
            }
            onClick={() => void handleMove()}
          >
            {to === null
              ? 'Move'
              : `Move to ${PACKAGE_PLACE_LABELS[to].toLowerCase()}`}
          </Button>
        }
      />
    </div>
  );
}

interface RecipesViewProps {
  ingredientId: string;
  name: string;
  soonDays: number;
  onBack: () => void;
  onOpenRecipe: (recipeId: string) => void;
}

function RecipesView({
  ingredientId,
  name,
  soonDays,
  onBack,
  onOpenRecipe,
}: RecipesViewProps) {
  const recipes = useAppSelector(selectRecipes);
  const byIngredient = useAppSelector(selectPackagesByIngredient);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const found = getUseItUpRecipes(
    recipes,
    byIngredient,
    ingredientId,
    (id) => ingredientsById.get(id)?.name ?? 'Removed ingredient',
    undefined,
    soonDays,
  );

  return (
    <div className='grid gap-3'>
      <BackLink onClick={onBack} />
      <div className='space-y-1'>
        <p className='font-medium'>Cook with {name}</p>
        <p className='text-muted-foreground text-sm'>
          Your recipes that use it, the ones that also use up something else
          first.
        </p>
      </div>
      {found.length === 0 ? (
        <p className='text-muted-foreground py-2 text-sm'>
          None of your recipes use {name} yet.
        </p>
      ) : (
        <ul className='divide-border divide-y'>
          {found.map((recipe) => {
            const detail = getUseItUpText(recipe.dueNames);
            return (
              <li key={recipe.id}>
                <Button
                  type='button'
                  variant='tertiary'
                  onClick={() => onOpenRecipe(recipe.id)}
                  className='h-auto min-h-14 w-full items-start justify-start gap-3 px-0! py-2 text-left'
                >
                  <span
                    className='bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl text-xl'
                    aria-hidden='true'
                  >
                    🍲
                  </span>
                  <span className='min-w-0 flex-1'>
                    <span className='text-foreground block font-medium wrap-break-word'>
                      {recipe.title}
                    </span>
                    {detail !== null && (
                      <span className='text-muted-foreground block text-xs font-normal'>
                        {detail}
                      </span>
                    )}
                  </span>
                  <ChevronRight
                    className='text-muted-foreground mt-2.5 h-5 w-5 shrink-0'
                    aria-hidden='true'
                  />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface FactsProps {
  pkg: Package;
  soonDays: number;
}

function Facts({ pkg, soonDays }: FactsProps) {
  const state = getPackageState(pkg.expiresAt, undefined, soonDays);
  const label = getPackageLabel(pkg.expiresAt) ?? 'No date';
  const openedDays = getOpenedDays(pkg);
  const opened =
    openedDays === null
      ? null
      : openedDays === 0
        ? 'Opened today'
        : `Opened ${openedDays} ${openedDays === 1 ? 'day' : 'days'} ago`;

  return (
    <div className='space-y-1.5'>
      <p className='text-muted-foreground flex flex-wrap gap-x-3 text-sm'>
        <span className='whitespace-nowrap'>
          <span aria-hidden='true'>{PACKAGE_PLACE_EMOJIS[pkg.place]}</span>{' '}
          {PACKAGE_PLACE_LABELS[pkg.place]}
        </span>
        <span className='whitespace-nowrap'>
          {formatSize(pkg.amount, pkg.unit)} left
        </span>
        {opened !== null && <span className='whitespace-nowrap'>{opened}</span>}
      </p>
      <p className='text-sm'>
        {state === 'PAST' || state === 'SOON' ? (
          <EatByBadge state={state} label={label} />
        ) : (
          <span className='whitespace-nowrap'>{label}</span>
        )}
      </p>
    </div>
  );
}

interface PackageSheetProps {
  uid: string;
  ingredientId: string;
  /** Opens on one package (an ingredient with a single one, or one picked from a row) instead of the list of them. */
  packageId: string | null;
  onClose: () => void;
  /** Closes this sheet and opens the add form on the ingredient. */
  onAdd: (ingredientId: string) => void;
  /** Closes this sheet and opens the edit form on the package. */
  onModify: (pkg: Package) => void;
  /** Closes this sheet and opens the recipe's drawer. */
  onOpenRecipe: (recipeId: string) => void;
}

function PackageSheet({
  uid,
  ingredientId,
  packageId,
  onClose,
  onAdd,
  onModify,
  onOpenRecipe,
}: PackageSheetProps) {
  const { confirm } = useActionModal();
  const { toss, remove } = usePackageActions(uid);
  const packagesById = useAppSelector(selectPackagesById);
  const byIngredient = useAppSelector(selectPackagesByIngredient);
  const name =
    useAppSelector(selectIngredientsById).get(ingredientId)?.name ??
    'Removed ingredient';
  const soonDays = useAppSelector(selectLeadDays);
  const [pickedId, setPickedId] = useState<string | null>(packageId);
  const [view, setView] = useState<SheetView>(
    packageId === null ? { kind: 'list' } : { kind: 'package' },
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const packages = byIngredient.get(ingredientId) ?? [];
  const picked = pickedId === null ? undefined : packagesById.get(pickedId);
  const only = packages.length === 1 ? packages[0] : undefined;
  const pkg = picked ?? only;
  const backToPackage = () => setView({ kind: 'package' });
  const backToList = () => {
    setPickedId(null);
    setView({ kind: 'list' });
    setError(null);
  };
  const pick = (next: Package) => {
    setPickedId(next.id);
    setView({ kind: 'package' });
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
    if (packages.length === 0) {
      return (
        <div className='grid gap-4'>
          <p className='text-muted-foreground py-4 text-center text-sm'>
            There is no {name.toLowerCase()} in your pantry anymore. It may have
            been finished on another device.
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

    if (view.kind === 'list' || pkg === undefined) {
      const stock = getStockView(ingredientId, packages, undefined, soonDays);
      return (
        <div className='grid gap-3'>
          <p className='text-muted-foreground text-sm'>
            {getStockSummaryParts(stock).join(' · ')}
          </p>
          <ul className='divide-border divide-y'>
            {packages.map((entry) => (
              <li key={entry.id}>
                <PackageRow pkg={entry} soonDays={soonDays} onOpen={pick} />
              </li>
            ))}
          </ul>
          <ModalFooterActions
            cancelAction={
              <Button type='button' variant='secondary' onClick={onClose}>
                Done
              </Button>
            }
            rightActions={
              <Button
                type='button'
                className='gap-1'
                onClick={() => onAdd(ingredientId)}
              >
                <Plus className='h-4 w-4' aria-hidden='true' />
                Add another
              </Button>
            }
          />
        </div>
      );
    }

    const afterAct = packages.length > 1 ? backToList : onClose;
    const viewProps = {
      uid,
      pkg,
      name,
      onBack: backToPackage,
      onDone: afterAct,
    };
    if (view.kind === 'use') return <UseView {...viewProps} />;
    if (view.kind === 'move') return <MoveView {...viewProps} />;
    if (view.kind === 'history') {
      return (
        <div className='grid gap-4'>
          <BackLink onClick={backToPackage} />
          <FormSection title='History'>
            <ul className='divide-border divide-y'>
              {[...pkg.history].reverse().map((event, index) => (
                <li key={`${event.at}-${index}`} className='py-2'>
                  <p className='text-sm wrap-break-word'>
                    {getPackageEventText(event, pkg.unit)}
                  </p>
                  {event.note !== null && event.kind !== 'EDITED' && (
                    <p className='text-muted-foreground text-xs'>
                      {event.note}
                    </p>
                  )}
                  <p className='text-muted-foreground text-xs'>
                    {formatDateShort(event.at)} · {formatTime(event.at)}
                  </p>
                </li>
              ))}
            </ul>
          </FormSection>
        </div>
      );
    }
    if (view.kind === 'recipes') {
      return (
        <RecipesView
          ingredientId={ingredientId}
          name={name}
          soonDays={soonDays}
          onBack={backToPackage}
          onOpenRecipe={onOpenRecipe}
        />
      );
    }

    const state = getPackageState(pkg.expiresAt, undefined, soonDays);
    const handleToss = () =>
      run(
        'toss',
        async () => {
          if ((await toss(pkg, name)) !== undefined) afterAct();
        },
        'Unable to save this.',
      );
    const handleDelete = async () => {
      const isConfirmed = await confirm({
        title: `Delete this ${name}?`,
        message: `It and its history are erased, and this can't be undone. If you used it or threw it out, say so from here instead.`,
        confirmText: 'Delete',
        destructive: true,
      });
      if (!isConfirmed) return;

      await run(
        'delete',
        async () => {
          if ((await remove(pkg)) !== undefined) afterAct();
        },
        'Unable to delete this.',
      );
    };
    const getPrimary = () => {
      if (state === 'PAST') {
        return {
          label: 'Toss it',
          icon: <Ban className='h-4 w-4' aria-hidden='true' />,
          onClick: () => void handleToss(),
          isBusy: busy === 'toss',
        };
      }
      if (state === 'SOON') {
        return {
          label: 'Use it up',
          icon: <ChefHat className='h-4 w-4' aria-hidden='true' />,
          onClick: () => setView({ kind: 'recipes' }),
          isBusy: false,
        };
      }
      return {
        label: 'Used some or all',
        icon: <Scale className='h-4 w-4' aria-hidden='true' />,
        onClick: () => setView({ kind: 'use' }),
        isBusy: false,
      };
    };
    const primary = getPrimary();
    const isPrimary = (label: string) => primary.label === label;
    const entries = pkg.history.length;

    return (
      <div className='grid gap-4'>
        {packages.length > 1 && (
          <BackLink onClick={backToList} label='All the packages' />
        )}
        <Facts pkg={pkg} soonDays={soonDays} />
        <ActionGroup>
          {!isPrimary('Used some or all') && (
            <ActionRow
              isGrouped
              icon={<Scale className='h-4 w-4' />}
              label='Used some or all'
              subtitle='Say how much you used'
              onClick={() => setView({ kind: 'use' })}
            />
          )}
          <ActionRow
            isGrouped
            icon={
              <span className='text-base leading-none'>
                {PACKAGE_PLACE_EMOJIS[pkg.place]}
              </span>
            }
            label='Move it'
            subtitle={`Now in ${getPlaceText(pkg.place)}`}
            onClick={() => setView({ kind: 'move' })}
          />
          {!isPrimary('Toss it') && (
            <ActionRow
              isGrouped
              isDestructive
              icon={<Ban className='h-4 w-4' />}
              label='Toss it'
              subtitle='You can undo it right after'
              isDisabled={busy === 'toss'}
              onClick={() => void handleToss()}
            />
          )}
          <GroupRow
            icon={<History className='h-4 w-4' />}
            onClick={() => setView({ kind: 'history' })}
          >
            <span className='text-base'>History</span>
            <span className='text-muted-foreground text-sm whitespace-nowrap'>
              {' · '}
              {entries === 1 ? '1 entry' : `${entries} entries`}
            </span>
          </GroupRow>
        </ActionGroup>
        <ErrorLine error={error} />
        <ModalFooterActions
          leftActions={
            <DeleteIconButton
              label={`Delete ${name}`}
              disabled={busy === 'delete'}
              onClick={() => void handleDelete()}
            />
          }
          cancelAction={
            <Button
              type='button'
              variant='secondary'
              onClick={() => onModify(pkg)}
            >
              Modify
            </Button>
          }
          rightActions={
            <Button
              type='button'
              className='gap-1.5 whitespace-nowrap'
              loading={primary.isBusy}
              onClick={primary.onClick}
            >
              {primary.icon}
              {primary.label}
            </Button>
          }
        />
      </div>
    );
  };

  return (
    <FormSheet isOpen onClose={onClose} title={name}>
      {getBody()}
    </FormSheet>
  );
}

export default PackageSheet;
