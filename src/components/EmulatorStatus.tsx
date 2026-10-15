import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useQuery } from '@tanstack/react-query';

import { emulatorStatusQueryOptions } from '@lib/dev/emulatorQueries';
import { app, emulatorAuthOrigin } from '@lib/firebase/config';

const getIndicator = (isError: boolean, isSeeded: boolean | undefined) => {
  if (isError) {
    return {
      className: 'h-5 bg-destructive text-destructive-foreground',
      message: "Emulators aren't running. Start them with npm run emulators.",
    };
  }
  if (isSeeded === undefined) return null;
  if (!isSeeded) {
    return {
      className: 'h-5 bg-warning text-warning-foreground',
      message: 'Emulators are empty. Run npm run seed:reset.',
    };
  }
  return { className: 'h-[3px] bg-success', message: null };
};

export function EmulatorStatus() {
  const { data, isError } = useQuery({
    ...emulatorStatusQueryOptions(emulatorAuthOrigin ?? '', app.options.projectId ?? ''),
    enabled: emulatorAuthOrigin !== null,
  });
  const indicator = getIndicator(isError, data?.isSeeded);

  if (!indicator) {
    return null;
  }

  return (
    <div
      role='status'
      className={join(
        'pointer-events-none fixed inset-x-0 top-0 z-40 flex items-center justify-center text-[11px] font-medium',
        indicator.className,
      )}
    >
      <span className={join(!indicator.message && 'sr-only')}>
        {indicator.message ?? 'Emulators running and seeded'}
      </span>
    </div>
  );
}
