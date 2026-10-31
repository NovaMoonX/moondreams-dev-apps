import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useHasGatesClosed } from '@/hooks/useFeatureGates';
import { ADMIN_NAME } from '@lib/app/app.constants';

interface GatesClosedNoteProps {
  appId: string;
  className?: string;
}

/** A quiet line at the bottom of an app's settings (or its main page when it has none) while any of its features is switched off for this person. */
function GatesClosedNote({ appId, className }: GatesClosedNoteProps) {
  const hasClosed = useHasGatesClosed(appId);
  if (!hasClosed) return null;

  return (
    <p
      className={join(
        'text-muted-foreground text-center text-xs text-balance',
        className,
      )}
    >
      Some features are turned off for you. Ask {ADMIN_NAME} if you&apos;d like
      them on.
    </p>
  );
}

export default GatesClosedNote;
