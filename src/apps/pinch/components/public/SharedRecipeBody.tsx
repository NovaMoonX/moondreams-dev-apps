import FormSection from '@/components/FormSection';
import SectionDivider from '@/components/SectionDivider';
import RecipeCareSection from '@apps/pinch/components/recipes/RecipeCareSection';
import RecipeLinksSection from '@apps/pinch/components/recipes/RecipeLinksSection';
import { UNIT_LABELS } from '@apps/pinch/constants';
import type { SharedIngredient, SharedRecipe } from '@apps/pinch/types';
import { groupIngredientLines } from '@apps/pinch/utils/ingredientGroups';
import { getRecipeCare } from '@apps/pinch/utils/recipeCare';
import { cleanLinks } from '@apps/pinch/utils/recipeLinks';

const LINK_REL = 'noopener noreferrer nofollow ugc';

const formatAmount = (line: SharedIngredient) =>
  `${Math.round((line.amount ?? 0) * 100) / 100} ${UNIT_LABELS[line.unit]}`.trim();

interface SharedRecipeBodyProps {
  recipe: SharedRecipe;
}

/** Every string is drawn as text, and a link opens only as https. */
function SharedRecipeBody({ recipe }: SharedRecipeBodyProps) {
  const care = getRecipeCare(recipe);
  const links = cleanLinks(
    recipe.links.map((link, index) => ({ ...link, id: String(index) })),
  ).filter((link) => link.url.startsWith('https://'));

  return (
    <div className='space-y-6'>
      {recipe.description && (
        <p className='text-sm wrap-break-word whitespace-pre-wrap'>
          {recipe.description}
        </p>
      )}

      <FormSection title='Ingredients'>
        <div className='border-border overflow-hidden rounded-2xl border'>
          {groupIngredientLines(recipe.ingredients).map((group) => (
            <div key={group.key}>
              {group.name !== null && (
                <SectionDivider label={group.name} className='px-4 pt-3 pb-1' />
              )}
              <ul className='divide-border divide-y'>
                {group.lines.map((line, index) => (
                  <li
                    key={index}
                    className='flex items-baseline justify-between gap-3 px-4 py-2.5'
                  >
                    <span className='min-w-0 wrap-break-word'>
                      {line.name}
                      {line.note && line.amount !== null && (
                        <span className='text-muted-foreground block text-xs'>
                          {line.note}
                        </span>
                      )}
                    </span>
                    {line.amount === null ? (
                      line.note && (
                        <span className='text-muted-foreground max-w-[55%] shrink-0 text-right text-sm wrap-break-word'>
                          {line.note}
                        </span>
                      )
                    ) : (
                      <span className='text-muted-foreground shrink-0 text-sm whitespace-nowrap'>
                        {formatAmount(line)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </FormSection>

      {recipe.steps.length > 0 && (
        <FormSection title='Steps'>
          <ol className='space-y-5 pt-1'>
            {recipe.steps.map((step, index) => (
              <li key={index} className='flex gap-3.5'>
                <span className='bg-accent text-accent-foreground flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold'>
                  {index + 1}
                </span>
                <span className='min-w-0 text-base/7 wrap-break-word whitespace-pre-wrap'>
                  {step}
                </span>
              </li>
            ))}
          </ol>
        </FormSection>
      )}

      {care && (
        <RecipeCareSection care={care} title='Keeping leftovers' isCard />
      )}

      <RecipeLinksSection links={links} rel={LINK_REL} isPlayerHidden />
    </div>
  );
}

export default SharedRecipeBody;
