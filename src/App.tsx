import { DreamerUIProvider } from '@moondreamsdev/dreamer-ui/providers';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router-dom';

import AppToast from '@components/AppToast';
import { TOAST_TYPE_STYLES } from '@components/toastTypeStyles';
import { AppCatalogProvider } from '@contexts/AppCatalogContext';
import { AuthProvider } from '@contexts/AuthContext';
import { NetworkStatusProvider } from '@contexts/NetworkStatusContext';
import { useReminderSync } from '@hooks/useReminderSync';
import { SITE_VERSION } from '@lib/app';
import {
  QUERY_CACHE_MAX_AGE,
  queryClient,
  queryPersister,
  shouldPersistQuery,
} from '@lib/query/queryClient';
import { router } from '@routes/AppRoutes';
import { store } from '@store/index';

// Central, app-wide reminder sync — every mini-app shares this one
// subscription instead of each wiring its own.
function AppShell() {
  useReminderSync();

  return <RouterProvider router={router} />;
}

const persistOptions = {
  persister: queryPersister,
  maxAge: QUERY_CACHE_MAX_AGE,
  // Drops the persisted cache on each release, so a changed response shape never rehydrates.
  buster: SITE_VERSION,
  dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
};

function App() {
  return (
    <Provider store={store}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={persistOptions}
      >
        <DreamerUIProvider
          toast={{ customTypes: TOAST_TYPE_STYLES, customComponent: AppToast }}
        >
          <NetworkStatusProvider>
            <AuthProvider>
              <AppCatalogProvider>
                <AppShell />
              </AppCatalogProvider>
            </AuthProvider>
          </NetworkStatusProvider>
        </DreamerUIProvider>
      </PersistQueryClientProvider>
    </Provider>
  );
}

export default App;
