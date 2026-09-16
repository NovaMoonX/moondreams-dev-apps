import { Avatar } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { getInitials } from '@/utils/accountUtils';

export interface AvatarStackPerson {
  id: string;
  name: string;
  photoURL?: string | null;
}

type AvatarStackSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

const OVERFLOW_BADGE_SIZE_CLASSES: Record<'xs' | 'sm', string> = {
  xs: 'h-8 w-8 text-xs',
  sm: 'h-10 w-10 text-sm',
};

interface AvatarStackProps {
  people: AvatarStackPerson[];
  size?: AvatarStackSize;
  /** Max avatars shown before the rest collapse into a "+N" badge. */
  max?: number;
  className?: string;
}

/**
 * A single avatar for one person, or a small overlapping stack (capped at `max`, with a "+N"
 * overflow badge beyond that) for several. Not tied to any one app's data model — pass whatever
 * people/avatars are relevant (cat photos, user profiles, etc).
 */
function AvatarStack({ people, size = 'sm', max = 3, className }: AvatarStackProps) {
  if (people.length === 0) {
    return null;
  }

  if (people.length === 1) {
    const person = people[0];

    return (
      <Avatar
        src={person.photoURL ?? undefined}
        alt={person.name}
        initials={person.photoURL ? undefined : getInitials(person.name)}
        size={size}
        shape='circle'
        className={className}
      />
    );
  }

  const stackedSize: 'xs' | 'sm' = size === 'lg' || size === 'xl' || size === '2xl' ? 'sm' : 'xs';
  const visiblePeople = people.slice(0, max);
  const overflowCount = people.length - visiblePeople.length;

  return (
    <div className={join('flex shrink-0 items-center', className)}>
      {visiblePeople.map((person, index) => (
        <Avatar
          key={person.id}
          src={person.photoURL ?? undefined}
          alt={person.name}
          initials={person.photoURL ? undefined : getInitials(person.name)}
          size={stackedSize}
          shape='circle'
          className={join('ring-card ring-1', index > 0 && '-ml-2')}
        />
      ))}
      {overflowCount > 0 && (
        <span
          className={join(
            'text-muted-foreground bg-muted border-border ring-card -ml-2 flex items-center justify-center rounded-full border ring-1',
            OVERFLOW_BADGE_SIZE_CLASSES[stackedSize],
          )}
        >
          +{overflowCount}
        </span>
      )}
    </div>
  );
}

export default AvatarStack;
