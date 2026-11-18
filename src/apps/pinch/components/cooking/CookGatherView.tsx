import CookIngredientsView, {
  type CookRow,
} from '@apps/pinch/components/cooking/CookIngredientsView';
import type { Recipe } from '@apps/pinch/types';
import { getMeasuringTools } from '@apps/pinch/utils/measuringTools';

export interface CookGatherDish {
  recipe: Recipe;
  rows: CookRow[];
  hasWrittenAmounts: boolean;
  servings: number;
  plannedServings: number | null;
  gotOut: Record<string, boolean>;
}

interface CookGatherViewProps {
  dishes: CookGatherDish[];
  onServingsChange: (recipeId: string, servings: number) => void;
  onToggle: (recipeId: string, id: string, isOut: boolean) => void;
  onReset: (recipeId: string) => void;
}

const lowerName = (name: string) =>
  /^[A-Z][a-z]/.test(name) ? name[0].toLowerCase() + name.slice(1) : name;

const sayNames = (names: string[]) => {
  const shown = names.length > 3 ? names.slice(0, 2) : names;
  const rest = names.length - shown.length;
  const words = shown.map(lowerName);
  if (rest > 0) return `${words.join(', ')} and ${rest} more`;
  if (words.length === 1) return words[0];
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
};

function CookGatherView({
  dishes,
  onServingsChange,
  onToggle,
  onReset,
}: CookGatherViewProps) {
  const isPlate = dishes.length > 1;
  const tools = getMeasuringTools(
    dishes.flatMap((dish) =>
      dish.rows.flatMap((row) =>
        row.measure === null
          ? []
          : [
              {
                name: row.name,
                amount: row.measure.amount,
                unit: row.measure.unit,
                isLiquid: row.isLiquid,
              },
            ],
      ),
    ),
  );

  return (
    <div className='mx-auto w-full max-w-2xl space-y-6'>
      <div className='space-y-1'>
        <h2 className='text-2xl leading-snug font-medium'>
          Get your ingredients out
        </h2>
        <p className='text-muted-foreground text-sm'>
          Set out everything first, so nothing is missing mid-step. Nothing is
          timed until you start cooking.
        </p>
      </div>
      {tools.length > 0 && (
        <section
          aria-labelledby='cook-tools-heading'
          className='bg-accent space-y-3 rounded-xl p-4'
        >
          <h3 id='cook-tools-heading' className='text-base font-medium'>
            What you'll measure with
          </h3>
          <ul className='space-y-2.5'>
            {tools.map((tool) => (
              <li key={tool.key}>
                <p className='text-base'>
                  {tool.name}
                  {tool.sizes.length > 0 && (
                    <span className='text-muted-foreground'>
                      {' · '}
                      {tool.sizes.join(', ')}
                    </span>
                  )}
                </p>
                <p className='text-muted-foreground text-sm wrap-break-word'>
                  For {sayNames(tool.names)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {dishes.map((dish) => (
        <section
          key={dish.recipe.id}
          aria-label={isPlate ? dish.recipe.title : undefined}
          className='space-y-3'
        >
          {isPlate && (
            <h3 className='border-border border-t pt-4 text-lg font-medium'>
              {dish.recipe.title}
            </h3>
          )}
          <CookIngredientsView
            recipe={dish.recipe}
            rows={dish.rows}
            stepLineIds={null}
            hasWrittenAmounts={dish.hasWrittenAmounts}
            servings={dish.servings}
            plannedServings={dish.plannedServings}
            gotOut={dish.gotOut}
            onServingsChange={(next) => onServingsChange(dish.recipe.id, next)}
            onToggle={(id, isOut) => onToggle(dish.recipe.id, id, isOut)}
            onReset={() => onReset(dish.recipe.id)}
          />
        </section>
      ))}
    </div>
  );
}

export default CookGatherView;
