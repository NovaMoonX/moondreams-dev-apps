import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Building2, MapPin, PawPrint } from 'lucide-react';

import type { WhoKind } from '@apps/helm/types';

interface WhoMarkProps {
  /** A place has no kind of its own; it takes the pin. */
  kind: WhoKind | 'place';
  name: string;
  isLarge?: boolean;
}

/** A person's initial, or a paw for a pet, a building for an organization and a pin for a place, in a round pewter disc. */
function WhoMark({ kind, name, isLarge = false }: WhoMarkProps) {
  const Icon =
    kind === 'pet'
      ? PawPrint
      : kind === 'organization'
        ? Building2
        : kind === 'place'
          ? MapPin
          : null;
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? '';

  return (
    <span
      aria-hidden='true'
      className={join(
        'bg-muted text-muted-foreground flex shrink-0 items-center justify-center rounded-full font-medium',
        isLarge ? 'helm-serif size-14 text-2xl' : 'size-10 text-base',
      )}
    >
      {Icon ? <Icon className={isLarge ? 'size-6' : 'size-[18px]'} /> : initial}
    </span>
  );
}

export default WhoMark;
