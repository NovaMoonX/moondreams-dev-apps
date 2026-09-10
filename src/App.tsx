import { DreamerUIProvider } from '@moondreamsdev/dreamer-ui/providers';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router-dom';

import { AppCatalogProvider } from '@contexts/AppCatalogContext';
import { AuthProvider } from '@contexts/AuthContext';
import { router } from '@routes/AppRoutes';
import { store } from '@store/index';

function App() {
  return (
    <Provider store={store}>
      <DreamerUIProvider>
        <AuthProvider>
          <AppCatalogProvider>
            <RouterProvider router={router} />
          </AppCatalogProvider>
        </AuthProvider>
      </DreamerUIProvider>
    </Provider>
  );
}

export default App;
