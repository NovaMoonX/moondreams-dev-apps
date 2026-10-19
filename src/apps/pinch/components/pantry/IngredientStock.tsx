import { Plus } from 'lucide-react';

import RevealChip from '@/components/RevealChip';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useState } from 'react';
import { useAppSelector } from '@/store';
import PackageRow from '@apps/pinch/components/pantry/PackageRow';
import {
  selectHasPackages,
  selectLeadDays,
  selectPackagesByIngredient,
} from '@apps/pinch/store/selectors';
import { getStockSummaryParts, getStockView } from '@apps/pinch/utils/packages';

const SHOWN_FIRST = 4;
/** Hiding a few rows costs more than showing them. */
const HIDDEN_WORTH_A_BUTTON = 3;

interface IngredientStockProps {
  ingredientId: string;
  /** A recipe or saved meal uses it, which is when a first package is worth offering. */
  isUsed: boolean;
  /** Opens the pantry on this ingredient's packages. */
  onOpen: () => void;
  onAdd: () => void;
}

/** What the person has of an ingredient, on the ingredient's own drawer: each package with its amount and date, soonest first, and a way to add one. It draws for an ingredient that has packages, for anyone who keeps a pantry, and for an ingredient their recipes use (the way to a first package); a first run with nothing using it sees nothing. */
function IngredientStock({
  ingredientId,
  isUsed,
  onOpen,
  onAdd,
}: IngredientStockProps) {
  const packages =
    useAppSelector(selectPackagesByIngredient).get(ingredientId) ?? [];
  const hasPantry = useAppSelector(selectHasPackages);
  const soonDays = useAppSelector(selectLeadDays);
  const [isOpen, setIsOpen] = useState(false);

  if (packages.length === 0 && !hasPantry && !isUsed) return null;

  const view = getStockView(ingredientId, packages, undefined, soonDays);
  const visible =
    isOpen || packages.length - SHOWN_FIRST <= HIDDEN_WORTH_A_BUTTON
      ? packages
      : packages.slice(0, SHOWN_FIRST);

  return (
    <section aria-label='In your kitchen' className='space-y-2'>
      <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
        In your kitchen
      </h3>
      {packages.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          None in your pantry, fridge or freezer.
        </p>
      ) : (
        <>
          {packages.length > 1 && (
            <p className='text-muted-foreground text-sm'>
              {getStockSummaryParts(view).join(' · ')}
            </p>
          )}
          <ul className='divide-border divide-y'>
            {visible.map((pkg) => (
              <li key={pkg.id}>
                <PackageRow pkg={pkg} soonDays={soonDays} onOpen={onOpen} />
              </li>
            ))}
          </ul>
          {visible.length < packages.length && (
            <ShowMoreButton onClick={() => setIsOpen(true)}>
              Show {packages.length - visible.length} more
            </ShowMoreButton>
          )}
        </>
      )}
      <div className='flex'>
        <RevealChip
          icon={<Plus className='h-4 w-4' aria-hidden='true' />}
          onClick={onAdd}
        >
          Add a package
        </RevealChip>
      </div>
    </section>
  );
}

export default IngredientStock;
