import { Badge } from '@moondreamsdev/dreamer-ui/components';

import type { Viewing } from '@apps/a-list/types';

interface ViewingStatusBadgeProps {
  viewing: Viewing;
  now: number;
}

function getStatusView(viewing: Viewing, now: number) {
  if (viewing.status === 'SEEN')
    return { emoji: '🍿', label: 'Seen', variant: 'secondary' } as const;
  if (viewing.endsAt <= now)
    return {
      emoji: '🎟️',
      label: 'Did you catch it?',
      variant: 'primary',
    } as const;
  return { emoji: '📅', label: 'Planned', variant: 'accent' } as const;
}

function ViewingStatusBadge({ viewing, now }: ViewingStatusBadgeProps) {
  const { emoji, label, variant } = getStatusView(viewing, now);

  return (
    <Badge
      variant={variant}
      size='xs'
      className='gap-1 rounded-full! whitespace-nowrap'
    >
      <span aria-hidden='true'>{emoji}</span>
      {label}
    </Badge>
  );
}

export default ViewingStatusBadge;
