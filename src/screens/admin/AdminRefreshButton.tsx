import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';

import { ADMIN_QUERY_KEY } from '@lib/admin/adminQueries';

import AdminIconButton from './AdminIconButton';

/** Re-reads everything the dashboard shows, since none of it is live. */
function AdminRefreshButton() {
  const queryClient = useQueryClient();
  const isRefreshing = useIsFetching({ queryKey: ADMIN_QUERY_KEY }) > 0;

  return (
    <AdminIconButton
      icon={<RefreshCw className='size-4' />}
      label='Refresh members and usage'
      isLoading={isRefreshing}
      isDisabled={isRefreshing}
      onClick={() =>
        queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEY })
      }
    />
  );
}

export default AdminRefreshButton;
