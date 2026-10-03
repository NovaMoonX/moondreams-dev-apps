import { Badge } from '@moondreamsdev/dreamer-ui/components';

import { AMC_FORMAT_LABELS } from '@apps/a-list/constants';
import type { AmcFormat } from '@apps/a-list/types';

interface FormatBadgeProps {
  format: AmcFormat;
}

function FormatBadge({ format }: FormatBadgeProps) {
  return (
    <Badge
      variant={format === 'STANDARD' ? 'muted' : 'secondary'}
      size='xs'
      className='rounded-full! whitespace-nowrap'
    >
      {AMC_FORMAT_LABELS[format]}
    </Badge>
  );
}

export default FormatBadge;
