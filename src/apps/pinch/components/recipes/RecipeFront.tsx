
import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight } from 'lucide-react';

import ClampedText from '@/components/ClampedText';
import FactsLine, { type Fact } from '@/components/FactsLine';
import FormSection from '@/components/FormSection';
import LabelChip from '@/components/LabelChip';
import MacroStats from '@/components/MacroStats';
import SectionDivider from '@/components/SectionDivider';
import StatTile from '@/components/StatTile';
import { useIsShortScreen } from '@/hooks/useIsShortScreen';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useAppSelector } from '@/store';
import LineStockMarker from '@apps/pinch/components/pantry/LineStockMarker';
import RecipeCareSection from '@apps/pinch/components/recipes/RecipeCareSection';
import RecipeJournalRow from '@apps/pinch/components/recipes/RecipeJournalRow';
import RecipeLinksSection from '@apps/pinch/components/recipes/RecipeLinksSection';
import CoverImage from '@apps/pinch/components/shared/CoverImage';
import GapNudge from '@apps/pinch/components/shared/GapNudge';
import LeftOutTip from '@apps/pinch/components/shared/LeftOutTip';
import { SECTION_COUNT_THRESHOLD, UNIT_LABELS } from '@apps/pinch/constants';
import {
  selectCollectionCounts,
  selectCollections,
  selectHasPackages,
  selectIngredientsById,
  selectPackagesByIngredient,
  selectRecipeCosts,
  selectRecipeNutrition,
  selectShowNutrition,
  selectSourceCounts,
  selectSourcesById,
} from '@apps/pinch/store/selectors';
import type { Gap, GapKind, Recipe } from '@apps/pinch/types';
import {
  getCollectionsPill,
  getRecipeCollections,
} from '@apps/pinch/utils/collections';
import { countLeftOutIngredients } from '@apps/pinch/utils/gaps';
import { groupIngredientLines } from '@apps/pinch/utils/ingredientGroups';
import { formatCost } from '@apps/pinch/utils/mealFormat';
import {
  getNutritionGaps,
  hasShownValue,
} from '@apps/pinch/utils/nutritionMath';
import {
  getLineMarkers,
  getLineStock,
  type LineStock,
} from '@apps/pinch/utils/packages';
import { getRecipeCare } from '@apps/pinch/utils/recipeCare';
import { hasCover } from '@apps/pinch/utils/recipeCover';
import {
  formatMinutes,
  formatServings,
  getTotalMinutes,
} from '@apps/pinch/utils/recipeFormat';
import { getRecipeLinks } from '@apps/pinch/utils/recipeLinks';
import { getRecipeSource } from '@apps/pinch/utils/sources';

const gapLabel = (kind: GapKind | undefined) => {
  if (kind === 'NO_PRODUCT') return 'No price yet';
  if (kind === 'NOT_COMPARABLE') return "Can't compare with the package size";
  return null;
};

const SOURCE_LABEL_KEEP_END = 14;

const SHORT_SCREEN_MAX_HEIGHT = 599;

interface RecipeFrontProps {
  uid: string;
  recipe: Recipe;
  /** The drawer's own photo view; without it the cover is only a picture. */
  onShowPhoto?: (opener: HTMLElement) => void;
  /** The drawer's own list of collections; without it "In 3 collections" is only a label. */
  onShowCollections?: (opener: HTMLElement | null) => void;
  /** Opens one of the person's entries to read and edit, or a new one when null; the journal row is drawn only where this exists. */
  onOpenEntry?: (noteId: string | null) => void;
  /** Opens the recipe's form to make a planned change. */
  onApplyChange?: (noteId: string) => void;
  /** Shows the Recipes list narrowed to this source; left out, the source is only a label. */
  onShowSource?: (sourceId: string) => void;
  /** Shows the Recipes list narrowed to this collection; left out, the collection is only a label. */
  onShowCollection?: (collectionId: string) => void;
  /** Opens the fill-in for what the cost leaves out; left out, no "Add prices" shows. */
  onFillIn?: (gaps: Gap[]) => void;
}

/** What a recipe is: its source and collections, description and facts, ingredients, steps, keeping it, cost, macros and links. The recipe's drawer shows it as its front, and a saved or planned meal swaps it in place. */
function RecipeFront({
  uid,
  recipe,
  onShowPhoto,
  onShowCollections,
  onOpenEntry,
  onApplyChange,
  onShowSource,
  onShowCollection,
  onFillIn,
}: RecipeFrontProps) {
  const sourcesById = useAppSelector(selectSourcesById);
  const sourceCounts = useAppSelector(selectSourceCounts).bySource;
  const collections = useAppSelector(selectCollections);
  const collectionCounts = useAppSelector(selectCollectionCounts).byCollection;
  const ingredientsById = useAppSelector(selectIngredientsById);
  const cost = useAppSelector(selectRecipeCosts).get(recipe.id);
  const nutrition = useAppSelector(selectRecipeNutrition).get(recipe.id);
  const show = useAppSelector(selectShowNutrition);
  const hasPantry = useAppSelector(selectHasPackages);
  const packagesByIngredient = useAppSelector(selectPackagesByIngredient);
  const isShort = useIsShortScreen(SHORT_SCREEN_MAX_HEIGHT);
  const { isBelow } = useMediaQuery();
  const isLandscape = isShort && !isBelow('sm');

  const care = getRecipeCare(recipe);
  const links = getRecipeLinks(recipe);
  const source = getRecipeSource(recipe, sourcesById);
  const hasMoreFromSource =
    source !== null &&
    onShowSource !== undefined &&
    (sourceCounts.get(source.id) ?? 0) > 1;
  const recipeCollections = getRecipeCollections(recipe, collections);
  const collectionsPill = getCollectionsPill(
    recipeCollections.map((collection) => collection.label),
  );
  const onlyCollection = recipeCollections[0];
  const canShowOnlyCollection =
    onShowCollection !== undefined &&
    onlyCollection !== undefined &&
    (collectionCounts.get(onlyCollection.id) ?? 0) > 1;

  const leftOutCount = cost ? countLeftOutIngredients(cost.leftOut) : 0;
  const isPriced = cost !== undefined && cost.totalCents !== null;
  const costHelp =
    isPriced && leftOutCount > 0 ? (
      <LeftOutTip
        leftOut={cost.leftOut}
        fix={
          leftOutCount === 1
            ? "It's marked in the ingredient list."
            : "They're marked in the ingredient list."
        }
      />
    ) : undefined;

  const pantryStocks = hasPantry
    ? new Map<string, LineStock>(
        recipe.ingredients.map((line) => {
          const ingredient = ingredientsById.get(line.ingredientId);
          return [
            line.id,
            getLineStock(
              line,
              packagesByIngredient.get(line.ingredientId),
              undefined,
              {
                gramsPerMl: ingredient?.gramsPerMl ?? null,
                gramsEach: ingredient?.gramsEach ?? null,
              },
              ingredient,
            ),
          ];
        }),
      )
    : null;
  const pantryMarkers =
    pantryStocks === null
      ? null
      : getLineMarkers(
          Array.from(pantryStocks, ([id, stock]) => ({ id, stock })),
        );

  const totalMinutes = getTotalMinutes(recipe);
  const facts: Fact[] = [
    { key: 'servings', content: formatServings(recipe.servings) },
    totalMinutes !== null && {
      key: 'time',
      content: formatMinutes(totalMinutes),
    },
    isPriced &&
      cost.perServingCents !== null && {
        key: 'cost',
        content: (
          <>
            {`${formatCost(cost.perServingCents)}${leftOutCount > 0 ? '+' : ''} per serving`}
            {costHelp && (
              <span className='ml-1 inline-flex align-middle'>{costHelp}</span>
            )}
          </>
        ),
      },
  ].filter((fact) => fact !== false);

  const hasMacros =
    nutrition !== undefined && hasShownValue(nutrition.values, show);

  const cover = (
    <CoverImage
      coverPath={recipe.coverPath}
      coverUrl={recipe.coverUrl ?? null}
      version={recipe.updatedAt}
      size={64}
    />
  );

  const nudge =
    cost && onFillIn ? (
      <GapNudge
        uid={uid}
        gaps={[
          ...cost.leftOut,
          ...getNutritionGaps(nutrition?.missing ?? [], show),
        ]}
        lead={isPriced ? undefined : 'See what it costs:'}
        onFillIn={onFillIn}
      />
    ) : null;
  const macroTiles = hasMacros ? (
    <div className='space-y-1.5'>
      <p className='text-muted-foreground text-xs'>Per serving</p>
      <MacroStats values={nutrition.values} show={show} variant='tiles' />
    </div>
  ) : null;
  const figures =
    isPriced || hasMacros || cost ? (
      <div className='space-y-3 empty:hidden'>
        {isPriced ? (
          <>
            <StatTile
              label='Cost'
              value={
                leftOutCount > 0
                  ? `${formatCost(cost.totalCents ?? 0)} so far`
                  : formatCost(cost.totalCents ?? 0)
              }
              detail={`For ${formatServings(recipe.servings)}`}
            />
            {nudge}
            {macroTiles}
          </>
        ) : (
          <>
            {macroTiles}
            {nudge}
          </>
        )}
      </div>
    ) : null;
  const linksSection = <RecipeLinksSection links={links} />;

  return (
    <div className='space-y-5'>
      {(source ||
        collectionsPill.kind !== 'none' ||
        hasCover(recipe) ||
        recipe.description ||
        facts.length > 0) && (
        <div className='space-y-2'>
          {(source || collectionsPill.kind !== 'none') && (
            <div className='flex items-center gap-2'>
              {source && (
                <div className='min-w-0'>
                  {hasMoreFromSource ? (
                    <LabelChip
                      ariaLabel={`From ${source.label}: show its recipes`}
                      keepEnd={SOURCE_LABEL_KEEP_END}
                      icon={
                        <ChevronRight
                          className='h-3 w-3 shrink-0'
                          aria-hidden='true'
                        />
                      }
                      onClick={() => onShowSource(source.id)}
                    >
                      {`From ${source.label}`}
                    </LabelChip>
                  ) : (
                    <LabelChip keepEnd={SOURCE_LABEL_KEEP_END}>
                      {`From ${source.label}`}
                    </LabelChip>
                  )}
                </div>
              )}
              {collectionsPill.kind === 'one' && (
                <div className='min-w-0'>
                  {canShowOnlyCollection ? (
                    <LabelChip
                      ariaLabel={`In ${collectionsPill.label}: show its recipes`}
                      keepEnd={SOURCE_LABEL_KEEP_END}
                      icon={
                        <ChevronRight
                          className='h-3 w-3 shrink-0'
                          aria-hidden='true'
                        />
                      }
                      onClick={() => onShowCollection(onlyCollection.id)}
                    >
                      {collectionsPill.label}
                    </LabelChip>
                  ) : (
                    <LabelChip keepEnd={SOURCE_LABEL_KEEP_END}>
                      {collectionsPill.label}
                    </LabelChip>
                  )}
                </div>
              )}
              {collectionsPill.kind === 'many' && (
                <div className='shrink-0'>
                  {onShowCollections ? (
                    <LabelChip
                      ariaLabel={`${collectionsPill.label}: show which`}
                      icon={
                        <ChevronRight
                          className='h-3 w-3 shrink-0'
                          aria-hidden='true'
                        />
                      }
                      onClick={() =>
                        onShowCollections(
                          document.activeElement instanceof HTMLElement
                            ? document.activeElement
                            : null,
                        )
                      }
                    >
                      {collectionsPill.label}
                    </LabelChip>
                  ) : (
                    <LabelChip>{collectionsPill.label}</LabelChip>
                  )}
                </div>
              )}
            </div>
          )}
          {(hasCover(recipe) || recipe.description || facts.length > 0) && (
            <div className='flex items-start gap-3'>
              {hasCover(recipe) &&
                (onShowPhoto ? (
                  <Button
                    type='button'
                    variant='tertiary'
                    size='stripped'
                    aria-label='Show the photo'
                    onClick={(event) => onShowPhoto(event.currentTarget)}
                    className='shrink-0 rounded-xl p-0'
                  >
                    {cover}
                  </Button>
                ) : (
                  cover
                ))}
              <div
                className={join(
                  'min-w-0 flex-1',
                  isLandscape ? 'flex items-baseline gap-x-4' : 'space-y-1',
                )}
              >
                {recipe.description && (
                  <div className='min-w-0 flex-1'>
                    <ClampedText
                      text={recipe.description}
                      maxLines={isLandscape ? 1 : 2}
                    />
                  </div>
                )}
                <FactsLine
                  facts={facts}
                  className={join(
                    'text-muted-foreground text-sm',
                    isLandscape && 'shrink-0',
                  )}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <FormSection
        title='Ingredients'
        isTitleHidden={isShort}
        detail={
          (pantryMarkers?.summary == null ? undefined : (
            <span className='tracking-normal normal-case'>
              {pantryMarkers.summary}
            </span>
          )) ??
          (recipe.ingredients.length > SECTION_COUNT_THRESHOLD
            ? recipe.ingredients.length
            : undefined)
        }
      >
        {groupIngredientLines(recipe.ingredients).map((group) => (
          <div key={group.key}>
            {group.name !== null && (
              <SectionDivider label={group.name} className='pt-3 pb-1' />
            )}
            <ul className='divide-border divide-y'>
              {group.lines.map((line) => {
                const gap = isPriced
                  ? gapLabel(cost.lines.get(line.id)?.gap?.kind)
                  : null;
                const pantryText = pantryMarkers?.byId.get(line.id) ?? null;
                const pantry = pantryStocks?.get(line.id) ?? null;
                return (
                  <li
                    key={line.id}
                    className='flex items-baseline justify-between gap-3 py-2'
                  >
                    <span className='min-w-0'>
                      {ingredientsById.get(line.ingredientId)?.name ??
                        'Removed ingredient'}
                      {line.note && line.amount !== null && (
                        <span className='text-muted-foreground block text-xs'>
                          {line.note}
                        </span>
                      )}
                      {gap && (
                        <span className='text-muted-foreground block text-xs'>
                          {gap}
                        </span>
                      )}
                    </span>
                    <span className='flex max-w-[55%] shrink-0 flex-col items-end gap-0.5 text-right'>
                      {line.amount === null ? (
                        line.note && (
                          <span className='text-muted-foreground text-sm wrap-break-word'>
                            {line.note}
                          </span>
                        )
                      ) : (
                        <span className='text-muted-foreground text-sm whitespace-nowrap'>
                          {Math.round(line.amount * 100) / 100}{' '}
                          {UNIT_LABELS[line.unit]}
                        </span>
                      )}
                      {pantry !== null && pantryText !== null && (
                        <LineStockMarker stock={pantry} text={pantryText} />
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </FormSection>

      {recipe.steps.length > 0 && (
        <FormSection title='Steps'>
          <ol className='space-y-3'>
            {recipe.steps.map((step, index) => (
              <li key={index} className='flex gap-3 text-sm'>
                <span className='bg-accent text-accent-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold'>
                  {index + 1}
                </span>
                <span className='min-w-0 space-y-1'>
                  <span className='block whitespace-pre-wrap'>{step}</span>
                </span>
              </li>
            ))}
          </ol>
        </FormSection>
      )}

      {care && <RecipeCareSection care={care} />}

      {isPriced ? (
        <>
          {figures}
          {linksSection}
        </>
      ) : (
        <>
          {linksSection}
          {figures}
        </>
      )}

      {onOpenEntry && onApplyChange && (
        <RecipeJournalRow
          recipeId={recipe.id}
          onOpen={onOpenEntry}
          onApplyChange={onApplyChange}
        />
      )}
    </div>
  );
}

export default RecipeFront;
