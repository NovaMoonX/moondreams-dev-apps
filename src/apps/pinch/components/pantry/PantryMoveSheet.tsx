import FormSheet from '@/components/FormSheet';
import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import {
  PACKAGE_PLACE_EMOJIS,
  PACKAGE_PLACE_LABELS,
  PACKAGE_PLACES,
} from '@apps/pinch/constants';
import type { Package, PackagePlace } from '@apps/pinch/types';

interface PantryMoveSheetProps {
  /** What the person ticked. */
  packages: Package[];
  onClose: () => void;
  onPick: (to: PackagePlace) => void;
}

/** Where a few ticked packages go: one tap on a place moves them, and a place they are all in already says so instead of offering nothing. */
function PantryMoveSheet({ packages, onClose, onPick }: PantryMoveSheetProps) {
  return (
    <FormSheet isOpen onClose={onClose} title='Where it goes'>
      <div className='grid gap-4'>
        <p className='text-muted-foreground text-sm'>
          {packages.length === 1
            ? 'The package keeps its amount and its date.'
            : `The ${packages.length} packages keep their amounts and dates.`}
        </p>
        <ActionGroup isRoomy>
          {PACKAGE_PLACES.map((place) => {
            const isThere = packages.every((pkg) => pkg.place === place);
            return (
              <ActionRow
                key={place}
                isGrouped
                isRoomy
                icon={<span>{PACKAGE_PLACE_EMOJIS[place]}</span>}
                label={PACKAGE_PLACE_LABELS[place]}
                subtitle={isThere ? 'Already there' : undefined}
                isDisabled={isThere || packages.length === 0}
                onClick={() => onPick(place)}
              />
            );
          })}
        </ActionGroup>
      </div>
    </FormSheet>
  );
}

export default PantryMoveSheet;
