import SectionDivider from '@/components/SectionDivider';
import LazyMount from '@/components/LazyMount';
import IngredientRow from '@apps/pinch/components/kitchen/IngredientRow';
import type { FamilyGroupData } from '@apps/pinch/utils/catalogSearch';

const ROW_HEIGHT = 57;
const DIVIDER_HEIGHT = 36;

interface FamilyGroupProps {
  group: FamilyGroupData;
  isEager: boolean;
  onOpen: (id: string) => void;
}

function FamilyGroup({ group, isEager, onOpen }: FamilyGroupProps) {
  const estimatedHeight =
    DIVIDER_HEIGHT + group.ingredients.length * ROW_HEIGHT;

  return (
    <section
      aria-label={group.family.name}
      className='defer-offscreen'
      style={{ '--defer-size': `${estimatedHeight}px` } as React.CSSProperties}
    >
      <LazyMount estimatedHeight={estimatedHeight} eager={isEager}>
        <SectionDivider
          label={group.family.name}
          trailing={
            <span className='text-muted-foreground text-xs'>
              {group.ingredients.length}
            </span>
          }
        />
        <ul className='divide-border divide-y'>
          {group.ingredients.map((ingredient) => (
            <li key={ingredient.id}>
              <IngredientRow ingredient={ingredient} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      </LazyMount>
    </section>
  );
}

export default FamilyGroup;
