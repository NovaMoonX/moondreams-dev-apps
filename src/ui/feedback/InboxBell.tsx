import { useNavigate } from 'react-router-dom';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Bell } from 'lucide-react';

import IconBadge from '@/components/IconBadge';
import { useAppSelector } from '@/store';
import { selectInboxBadgeCount } from '@store/slices/feedbackSlice';
import { useAuth } from '@hooks/useAuth';

/** The header's bell: opens the inbox of replies (and, for the owner, new feedback), with a count only when something is waiting. Signed out, it isn't drawn. */
function InboxBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const badgeCount = useAppSelector(selectInboxBadgeCount) ?? 0;

  if (!user) return null;

  return (
    <Button
      type='button'
      variant='base'
      size='sm'
      aria-label={badgeCount > 0 ? `Inbox, ${badgeCount} new` : 'Inbox'}
      className="relative h-10 w-10 p-0 after:absolute after:-inset-1 after:content-['']"
      onClick={() => navigate('/inbox')}
    >
      <IconBadge
        icon={<Bell className='h-5 w-5' />}
        count={badgeCount}
        urgent
      />
    </Button>
  );
}

export default InboxBell;
