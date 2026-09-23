import { DreamerUIProvider } from '@moondreamsdev/dreamer-ui/providers';
import { QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router-dom';

import { AppCatalogProvider } from '@contexts/AppCatalogContext';
import { AuthProvider } from '@contexts/AuthContext';
import { NetworkStatusProvider } from '@contexts/NetworkStatusContext';
import { useReminderSync } from '@hooks/useReminderSync';
import { queryClient } from '@lib/query/queryClient';
import { router } from '@routes/AppRoutes';
import { store } from '@store/index';

// Central, app-wide reminder sync — every mini-app shares this one
// subscription instead of each wiring its own.
function AppShell() {
  useReminderSync();

  return <RouterProvider router={router} />;
}

function App() {
  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <DreamerUIProvider>
          <NetworkStatusProvider>
            <AuthProvider>
              <AppCatalogProvider>
                <AppShell />
              </AppCatalogProvider>
            </AuthProvider>
          </NetworkStatusProvider>
        </DreamerUIProvider>
      </QueryClientProvider>
    </Provider>
  );
}

export default App;
