import { useCallback, useMemo, useState } from 'react';

import { Button, Checkbox } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import {
  ArrowRightLeft,
  Ban,
  Check,
  ChevronDown,
  ListChecks,
  Plus,
  Utensils,
} from 'lucide-react';

import HeaderIconButton from '@/components/HeaderIconButton';
import IntroCard from '@/components/IntroCard';
import Pill from '@/components/Pill';
import { PillGroup, type PillOption } from '@/components/PillGroup';
import PromptRow from '@/components/PromptRow';
import SearchInput from '@/components/SearchInput';
import SectionDivider from '@/components/SectionDivider';
import SectionHeader from '@/components/SectionHeader';
import SelectionBar from '@/components/SelectionBar';
import ShowMoreButton from '@/components/ShowMoreButton';
import Subview from '@/components/Subview';
import { useIsShortScreen } from '@/hooks/useIsShortScreen';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useSelection } from '@/hooks/useSelection';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import PackageFormSheet from '@apps/pinch/components/pantry/PackageFormSheet';
import PackageRow from '@apps/pinch/components/pantry/PackageRow';
import PackageSheet from '@apps/pinch/components/pantry/PackageSheet';
import PantryMoveSheet from '@apps/pinch/components/pantry/PantryMoveSheet';
import PantryRecipeDrawer from '@apps/pinch/components/pantry/PantryRecipeDrawer';
import PantryRow from '@apps/pinch/components/pantry/PantryRow';
import {
  LIST_SEARCH_THRESHOLD,
  PACKAGE_LIST_PAGE_SIZE,
  PACKAGE_PLACE_LABELS,
  PACKAGE_PLACES,
  PANTRY_INTRO_MAX_INGREDIENTS,
  PANTRY_SECTION_EMOJIS,
  PANTRY_SPLIT_MIN_ROWS,
} from '@apps/pinch/constants';
import { usePackageActions } from '@apps/pinch/hooks/usePackageActions';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import {
  selectIngredientsById,
  selectLeadDays,
  selectPackages,
} from '@apps/pinch/store/selectors';
import { getShopSection } from '@apps/pinch/utils/shopping';
import type { Package, PackagePlace } from '@apps/pinch/types';
import { searchByName } from '@apps/pinch/utils/catalogSearch';
import {
  getPackageBulkNames,
  getPackageNamesLine,
  getPackageSelectionNote,
  getPackageSelectionPrimary,
  getPackageSelectionTitle,
  getPackageTossAction,
  getPackageTossNote,
  getPackageTossTitle,
  getPackagesPastDueText,
  getPastDuePackages,
  getStockView,
  groupPackagesByIngredient,
  sortGroups,
  type PackageBulkAction,
  type StockView,
} from '@apps/pinch/utils/packages';

const VERY_SHORT_SCREEN_MAX_HEIGHT = 499;

interface ActNote {
  text: string;
  isError: boolean;
}

interface OpenSheet {
  ingredientId: string;
  packageId: string | null;
}

interface FormTarget {
  pkg: Package | null;
  ingredientId: string | null;
}

interface PantryRowData {
  view: StockView;
  name: string;
  emoji: string;
}

interface PantrySubviewProps {
  uid: string;
  /** Opens this ingredient's packages first, for a door that came from the ingredient. */
  ingredientId: string | null;
}

function PantrySubview({
  uid,
  ingredientId: startIngredientId,
}: PantrySubviewProps) {
  const { closeSubview } = usePinchOverlay();
  const { confirm } = useActionModal();
  const { isReady, loadError, changeInPlace } = usePackageActions(uid);
  const selection = useSelection();
  const { isBelow } = useMediaQuery();
  const isVeryShort = useIsShortScreen(VERY_SHORT_SCREEN_MAX_HEIGHT);
  const packages = useAppSelector(selectPackages);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const soonDays = useAppSelector(selectLeadDays);
  const [pick, setPick] = useState<PackagePlace | null>(null);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PACKAGE_LIST_PAGE_SIZE);
  const [open, setOpen] = useState<OpenSheet | null>(() => {
    if (startIngredientId === null) return null;

    const own = packages.filter(
      (pkg) => pkg.ingredientId === startIngredientId,
    );
    return own.length === 0
      ? null
      : {
          ingredientId: startIngredientId,
          packageId: own.length === 1 ? own[0].id : null,
        };
  });
  const [form, setForm] = useState<FormTarget | null>(null);
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [acting, setActing] = useState<PackageBulkAction['kind'] | null>(null);
  const [actNote, setActNote] = useState<ActNote | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const getName = useCallback(
    (ingredientId: string, fallback: string) =>
      ingredientsById.get(ingredientId)?.name ?? fallback,
    [ingredientsById],
  );

  const ingredientCount = useMemo(
    () => new Set(packages.map((pkg) => pkg.ingredientId)).size,
    [packages],
  );
  const hasSearch = ingredientCount >= LIST_SEARCH_THRESHOLD;
  const trimmed = hasSearch ? query.trim() : '';

  const placesPresent = useMemo(
    () =>
      PACKAGE_PLACES.filter((place) =>
        packages.some((pkg) => pkg.place === place),
      ),
    [packages],
  );
  const shownPick = pick !== null && placesPresent.includes(pick) ? pick : null;

  // Every ingredient with something on hand, matched by the search; a place narrows what each row sums up.
  const matched = useMemo(() => {
    const entries = Array.from(
      sortGroups(groupPackagesByIngredient(packages)),
      ([ingredientId, list]) => ({
        ingredientId,
        list,
        name: getName(ingredientId, list[0].ingredientName),
      }),
    );
    return trimmed === '' ? entries : searchByName(entries, trimmed);
  }, [packages, getName, trimmed]);
  const countsByPlace = useMemo(
    () =>
      PACKAGE_PLACES.reduce<Record<PackagePlace, number>>(
        (counts, place) => ({
          ...counts,
          [place]: matched.filter((entry) =>
            entry.list.some((pkg) => pkg.place === place),
          ).length,
        }),
        { PANTRY: 0, FRIDGE: 0, FREEZER: 0 },
      ),
    [matched],
  );

  const rows = useMemo<PantryRowData[]>(
    () =>
      matched
        .map((entry) => ({
          name: entry.name,
          emoji:
            PANTRY_SECTION_EMOJIS[
              getShopSection(ingredientsById.get(entry.ingredientId))
            ],
          view: getStockView(
            entry.ingredientId,
            shownPick === null
              ? entry.list
              : entry.list.filter((pkg) => pkg.place === shownPick),
            undefined,
            soonDays,
          ),
        }))
        .filter((row) => row.view.packages.length > 0)
        .sort(
          (a, b) =>
            (a.view.packages[0].expiresAt === null ? 1 : 0) -
              (b.view.packages[0].expiresAt === null ? 1 : 0) ||
            (a.view.packages[0].expiresAt ?? 0) -
              (b.view.packages[0].expiresAt ?? 0) ||
            a.name.localeCompare(b.name),
        ),
    [matched, shownPick, soonDays, ingredientsById],
  );
  const shownPackages = useMemo(
    () => rows.flatMap((row) => row.view.packages),
    [rows],
  );
  const pastBoxes = useMemo(
    () => getPastDuePackages(shownPackages),
    [shownPackages],
  );
  const isNeedsLook = (row: PantryRowData) =>
    row.view.pastCount > 0 || row.view.soonCount > 0;

  const isListShown = isReady && loadError === null;
  const isSelecting = selection.isActive;
  const isWhole = isListShown && trimmed === '';
  const hasSwitch = isListShown && placesPresent.length > 1;
  const canSelect = isListShown && shownPackages.length >= 2;
  const hasPastDueRow = isWhole && !isSelecting && pastBoxes.length > 0;
  const selectedPackages = shownPackages.filter((pkg) =>
    selection.ids.has(pkg.id),
  );
  const isNothingTicked = selectedPackages.length === 0;
  const isBlocked = isNothingTicked || acting !== null;
  const isCompact = isBelow('sm') || isVeryShort;
  const isShortSelect = isSelecting && isVeryShort;
  const isTossLead = getPackageSelectionPrimary(selectedPackages) === 'TOSS';
  const title = isSelecting
    ? getPackageSelectionTitle(selectedPackages.length)
    : 'Pantry';

  const toggleAll = (list: Package[]) =>
    selection.toggle(list.map((pkg) => pkg.id));
  const isEveryTicked = (list: Package[]) =>
    list.length > 0 && list.every((pkg) => selection.ids.has(pkg.id));
  const togglePackage = useCallback(
    (pkg: Package) => selection.toggle([pkg.id]),
    [selection],
  );

  const getNameOf = (pkg: Package) =>
    getName(pkg.ingredientId, pkg.ingredientName);

  const confirmToss = (list: Package[]) => {
    const { lines, more } = getPackageBulkNames(list, getNameOf);
    return confirm({
      title: getPackageTossTitle(list.length),
      message: (
        <div className='space-y-3 text-left'>
          <ul className='space-y-2'>
            {lines.map(({ title: lineTitle, details }, index) => (
              <li key={index}>
                <span className='block font-medium'>{lineTitle}</span>
                <span className='text-muted-foreground flex flex-wrap gap-x-3 text-sm'>
                  {details.map((detail) => (
                    <span key={detail} className='whitespace-nowrap'>
                      {detail}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          {more > 0 && (
            <p>
              and {more} more {more === 1 ? 'package' : 'packages'}
            </p>
          )}
          <p>{getPackageTossNote(list.length)}</p>
        </div>
      ),
      confirmText: getPackageTossAction(list.length),
      cancelText: list.length === 1 ? 'Keep it' : 'Keep them',
      destructive: true,
    });
  };

  const handleAct = async (
    action: PackageBulkAction,
    list: Package[],
    isConfirmed = false,
  ) => {
    if (acting !== null || list.length === 0) return;
    if (action.kind === 'TOSS' && !isConfirmed && !(await confirmToss(list))) {
      return;
    }

    setActNote(null);
    setActing(action.kind);
    try {
      const result = await changeInPlace(
        action,
        list.map((pkg) => pkg.id),
        (changedIds) =>
          getPackageNamesLine(
            list.filter((pkg) => changedIds.includes(pkg.id)).map(getNameOf),
          ),
      );
      if (result === undefined) return;
      if (result.count > 0) selection.exit();
      if (result.error !== null) {
        setActNote({ text: result.error, isError: true });
      } else if (result.count === 0) {
        setActNote({
          text: result.skippedText ?? 'Nothing was left there to change.',
          isError: false,
        });
      }
    } catch (error) {
      setActNote({
        text: getErrorMessage(error, "Couldn't save that."),
        isError: true,
      });
    } finally {
      setActing(null);
    }
  };

  const tossAction = {
    key: 'toss',
    label: 'Toss',
    icon: <Ban className='h-4 w-4' aria-hidden='true' />,
    isDisabled: isBlocked,
    isLoading: acting === 'TOSS',
    onClick: () => void handleAct({ kind: 'TOSS' }, selectedPackages),
  };
  const useUpAction = {
    key: 'use-up',
    label: 'Used it up',
    icon: <Utensils className='h-4 w-4' aria-hidden='true' />,
    isDisabled: isBlocked,
    isLoading: acting === 'USE_UP',
    onClick: () => void handleAct({ kind: 'USE_UP' }, selectedPackages),
  };

  const toggleExpanded = (ingredientId: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(ingredientId)) next.add(ingredientId);
      return next;
    });

  const handleOpenRow = useCallback(
    (ingredientId: string) => {
      const row = rows.find(
        (entry) => entry.view.ingredientId === ingredientId,
      );
      const [first] = row?.view.packages ?? [];
      setOpen({
        ingredientId,
        packageId: row?.view.packages.length === 1 ? first.id : null,
      });
    },
    [rows],
  );

  const renderSelectRow = (row: PantryRowData) => {
    const list = row.view.packages;
    if (list.length === 1) {
      const [only] = list;
      return (
        <li key={row.view.ingredientId}>
          <PackageRow
            pkg={only}
            title={row.name}
            emoji={row.emoji}
            soonDays={soonDays}
            isSelecting
            isSelected={selection.ids.has(only.id)}
            onToggle={togglePackage}
          />
        </li>
      );
    }
    const isListOpen = expanded.has(row.view.ingredientId);
    const tickedCount = list.filter((pkg) => selection.ids.has(pkg.id)).length;
    return (
      <li key={row.view.ingredientId}>
        <div className='flex items-start gap-1'>
          <label className='flex min-h-14 min-w-0 flex-1 cursor-pointer items-start gap-3 py-2 select-none'>
            <span className='mt-0.5 inline-flex shrink-0'>
              <Checkbox
                aria-label={`All ${list.length} packages of ${row.name}`}
                checked={isEveryTicked(list)}
                onCheckedChange={() => toggleAll(list)}
              />
            </span>
            <span
              className='bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl text-xl'
              aria-hidden='true'
            >
              {row.emoji}
            </span>
            <span className='min-w-0 flex-1'>
              <span className='block font-medium wrap-break-word'>
                {row.name}
              </span>
              <span className='text-muted-foreground block text-xs'>
                {list.length} packages
                {tickedCount > 0 &&
                  tickedCount < list.length &&
                  ` · ${tickedCount} ticked`}
              </span>
            </span>
          </label>
          <Button
            type='button'
            variant='tertiary'
            size='icon'
            aria-expanded={isListOpen}
            aria-label={`${isListOpen ? 'Hide' : 'Show'} the ${list.length} packages of ${row.name}`}
            className='text-muted-foreground! mt-2 size-10 min-w-10 shrink-0 p-0'
            onClick={() => toggleExpanded(row.view.ingredientId)}
          >
            <ChevronDown
              className={join('h-5 w-5', isListOpen && 'rotate-180')}
              aria-hidden='true'
            />
          </Button>
        </div>
        {isListOpen && (
          <ul>
            {list.map((pkg) => (
              <li key={pkg.id}>
                <PackageRow
                  pkg={pkg}
                  soonDays={soonDays}
                  isSelecting
                  isNested
                  isSelected={selection.ids.has(pkg.id)}
                  onToggle={togglePackage}
                />
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  };

  const renderRow = (row: PantryRowData) => (
    <li key={row.view.ingredientId}>
      <PantryRow
        view={row.view}
        name={row.name}
        emoji={row.emoji}
        soonDays={soonDays}
        onOpen={handleOpenRow}
      />
    </li>
  );

  const getBody = () => {
    if (loadError !== null) {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          Your pantry couldn't load just now.
        </p>
      );
    }
    if (!isReady) {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          Loading your pantry…
        </p>
      );
    }
    if (packages.length === 0) {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          Nothing in your pantry yet. When you bring something home, add it here
          with the date on its package.
        </p>
      );
    }
    if (rows.length === 0) {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm wrap-break-word'>
          Nothing matches “{trimmed}”.
        </p>
      );
    }

    const noteLine = actNote && (
      <p
        role={actNote.isError ? 'alert' : 'status'}
        className={join(
          'text-sm wrap-break-word',
          actNote.isError ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {actNote.text}
      </p>
    );
    const isSplit =
      !isSelecting &&
      rows.length >= PANTRY_SPLIT_MIN_ROWS &&
      rows.some(isNeedsLook) &&
      rows.some((row) => !isNeedsLook(row));
    const visible = rows.length - limit > 3 ? limit : rows.length;
    const shownRows = rows.slice(0, visible);
    const render = isSelecting ? renderSelectRow : renderRow;
    const listClass =
      'border-border divide-border mb-1 divide-y rounded-2xl border px-3';
    const renderList = (list: PantryRowData[]) => (
      <ul className={listClass}>{list.map(render)}</ul>
    );
    const needs = shownRows.filter(isNeedsLook);
    const rest = shownRows.filter((row) => !isNeedsLook(row));

    return (
      <section aria-label='Pantry' className='space-y-1'>
        {noteLine}
        {isSplit ? (
          <div className='space-y-3'>
            {needs.length > 0 && (
              <div className='space-y-1'>
                <SectionDivider label='Needs a look' />
                {renderList(needs)}
              </div>
            )}
            {rest.length > 0 && (
              <div className='space-y-1'>
                <SectionDivider label='Everything else' />
                {renderList(rest)}
              </div>
            )}
          </div>
        ) : (
          renderList(shownRows)
        )}
        {visible < rows.length && (
          <ShowMoreButton
            onClick={() =>
              setLimit((current) => current + PACKAGE_LIST_PAGE_SIZE)
            }
          >
            Show {Math.min(PACKAGE_LIST_PAGE_SIZE, rows.length - visible)} more
          </ShowMoreButton>
        )}
      </section>
    );
  };

  const getHeaderAction = () => {
    if (isSelecting) {
      return (
        <Button
          type='button'
          variant='secondary'
          size='sm'
          rounded='full'
          className={join(
            "relative h-7 px-3 after:absolute after:-inset-1.5 after:content-['']",
            !isVeryShort && '[@media(max-height:699px)]:hidden',
          )}
          onClick={selection.exit}
        >
          Cancel
        </Button>
      );
    }
    return (
      <div className='flex items-center gap-3'>
        {canSelect && (
          <HeaderIconButton
            icon={<ListChecks className='h-4 w-4' aria-hidden='true' />}
            label='Select packages'
            onClick={() => {
              setExpanded(new Set());
              selection.start();
            }}
          />
        )}
        <Button
          type='button'
          size='sm'
          rounded='full'
          className="relative gap-1 after:absolute after:-inset-1.5 after:content-['']"
          aria-label='Add a package'
          disabled={!isReady}
          onClick={() => setForm({ pkg: null, ingredientId: null })}
        >
          <Plus className='h-4 w-4' aria-hidden='true' />
          Add
        </Button>
      </div>
    );
  };

  const selectPills = isSelecting &&
    isListShown &&
    shownPackages.length > 0 && (
      <div
        role='group'
        aria-label='Select several at once'
        className='flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2'
      >
        {pastBoxes.length > 0 && (
          <Pill
            isThin
            isSelected={isEveryTicked(pastBoxes)}
            icon={
              isEveryTicked(pastBoxes) ? (
                <Check className='h-3 w-3' aria-hidden='true' />
              ) : undefined
            }
            onClick={() => toggleAll(pastBoxes)}
          >
            {isCompact ? 'All past their date' : 'Select all past their date'}
          </Pill>
        )}
        <Pill
          isThin
          isSelected={isEveryTicked(shownPackages)}
          icon={
            isEveryTicked(shownPackages) ? (
              <Check className='h-3 w-3' aria-hidden='true' />
            ) : undefined
          }
          onClick={() => toggleAll(shownPackages)}
        >
          {isCompact ? 'All shown' : 'Select all shown'}
        </Pill>
      </div>
    );
  const isIntroShown =
    isListShown &&
    !isSelecting &&
    packages.length > 0 &&
    ingredientCount <= PANTRY_INTRO_MAX_INGREDIENTS;

  const viewOptions: PillOption<'ALL' | PackagePlace>[] = [
    {
      value: 'ALL',
      label: 'All',
      detail: String(matched.length),
    },
    ...placesPresent.map((place) => ({
      value: place,
      label: PACKAGE_PLACE_LABELS[place],
      detail: String(countsByPlace[place]),
    })),
  ];

  return (
    <Subview
      title={title}
      onClose={closeSubview}
      onBack={isSelecting ? selection.exit : undefined}
      headerAction={isShortSelect ? getHeaderAction() : undefined}
    >
      <div className='space-y-4'>
        {isIntroShown && (
          <IntroCard icon='🥫' lead='What you have on hand.'>
            Each package keeps its own amount and date, so two cartons of milk
            can run out on different days.
          </IntroCard>
        )}
        <SectionHeader
          title={title}
          subtitle={
            isSelecting || isIntroShown
              ? undefined
              : 'What is on hand, and when to use it by.'
          }
          lead={(!isShortSelect && selectPills) || undefined}
          action={isShortSelect ? undefined : getHeaderAction()}
        />
        {(hasSwitch || (isShortSelect && selectPills)) && (
          <div className='flex items-center gap-x-3'>
            {hasSwitch && (
              <div className='min-w-0'>
                <PillGroup
                  label='Which part of the pantry'
                  options={viewOptions}
                  value={shownPick ?? 'ALL'}
                  onChange={(next) => {
                    setPick(next === 'ALL' ? null : next);
                    setActNote(null);
                  }}
                  isThin
                />
              </div>
            )}
            {isShortSelect && selectPills && (
              <div className='shrink-0'>{selectPills}</div>
            )}
          </div>
        )}
        {isSelecting && (
          <p role='status' className='sr-only'>
            {getPackageSelectionTitle(selectedPackages.length)}
          </p>
        )}
        {hasSearch && isListShown && (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder='Search your pantry'
          />
        )}
        {hasPastDueRow && (
          <PromptRow
            icon='⏳'
            title={getPackagesPastDueText(pastBoxes.length)}
            actionLabel={getPackageTossAction(pastBoxes.length)}
            isBusy={acting === 'TOSS'}
            isDisabled={acting !== null}
            onAction={() =>
              void handleAct({ kind: 'TOSS', isPastOnly: true }, pastBoxes)
            }
          />
        )}
        {getBody()}
      </div>
      {isSelecting && (
        <SelectionBar
          note={isNothingTicked ? getPackageSelectionNote(0) : null}
          actions={[
            isTossLead ? useUpAction : { ...tossAction, isDestructive: true },
            {
              key: 'move',
              label: 'Move',
              icon: <ArrowRightLeft className='h-4 w-4' aria-hidden='true' />,
              isDisabled: isBlocked,
              isLoading: acting === 'MOVE',
              onClick: () => setIsMoving(true),
            },
          ]}
          primary={isTossLead ? tossAction : useUpAction}
        />
      )}
      {open && (
        <PackageSheet
          key={`${open.ingredientId}-${open.packageId ?? 'all'}`}
          uid={uid}
          ingredientId={open.ingredientId}
          packageId={open.packageId}
          onClose={() =>
            setOpen((current) => (current === open ? null : current))
          }
          onAdd={(ingredientId) => {
            setOpen(null);
            setForm({ pkg: null, ingredientId });
          }}
          onModify={(pkg) => {
            setOpen(null);
            setForm({ pkg, ingredientId: pkg.ingredientId });
          }}
          onOpenRecipe={(id) => {
            setOpen(null);
            setRecipeId(id);
          }}
        />
      )}
      {form && (
        <PackageFormSheet
          key={form.pkg?.id ?? `new-${form.ingredientId ?? ''}`}
          uid={uid}
          pkg={form.pkg}
          ingredientId={form.ingredientId}
          onClose={() => setForm(null)}
          onAdded={(added) =>
            setPick((current) =>
              current !== null && current !== added.place ? null : current,
            )
          }
        />
      )}
      {isMoving && (
        <PantryMoveSheet
          packages={selectedPackages}
          onClose={() => setIsMoving(false)}
          onPick={(to) => {
            setIsMoving(false);
            void handleAct({ kind: 'MOVE', to }, selectedPackages);
          }}
        />
      )}
      {recipeId && (
        <PantryRecipeDrawer
          key={recipeId}
          uid={uid}
          recipeId={recipeId}
          onClose={() => setRecipeId(null)}
        />
      )}
    </Subview>
  );
}

export default PantrySubview;
