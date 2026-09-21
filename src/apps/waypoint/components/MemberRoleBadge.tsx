import { Badge } from '@moondreamsdev/dreamer-ui/components';

import { MEMBER_ROLE_LABELS } from '@apps/waypoint/constants';
import type { UserRole } from '@apps/waypoint/types';

interface MemberRoleBadgeProps {
  role: UserRole;
}

function MemberRoleBadge({ role }: MemberRoleBadgeProps) {
  return <Badge>{MEMBER_ROLE_LABELS[role]}</Badge>;
}

export default MemberRoleBadge;
