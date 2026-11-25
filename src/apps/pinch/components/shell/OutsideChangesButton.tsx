import DoneForYouButton from '@/components/DoneForYouButton';
import { OUTSIDE_CHANGES_WORDS } from '@apps/pinch/constants';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';

/** Done for you's clock in a header, drawn only once an assistant has changed something. */
function OutsideChangesButton() {
  const { outsideChanges } = usePinchOverlay();

  if (!outsideChanges.hasItems) return null;

  return (
    <DoneForYouButton
      hasUnseen={outsideChanges.hasUnseen}
      onClick={outsideChanges.open}
      label={OUTSIDE_CHANGES_WORDS.buttonLabel}
    />
  );
}

export default OutsideChangesButton;
