import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';

import { ADMIN_QUERY_KEY } from '@lib/admin/adminQueries';

/** Re-reads everything the dashboard shows, since none of it is live. */
function AdminRefreshButton() {
  const queryClient = useQueryClient();
  const isRefreshing = useIsFetching({ queryKey: ADMIN_QUERY_KEY }) > 0;

  return (
    <Button
      variant='outline'
      size='icon'
      className='size-10'
      aria-label='Refresh members and usage'
      disabled={isRefreshing}
      onClick={() => queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEY })}
    >
      <RefreshCw className={join('size-4', isRefreshing && 'animate-spin')} />
    </Button>
  );
}

export default AdminRefreshButton;
