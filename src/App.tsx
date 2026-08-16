import { DreamerUIProvider } from '@moondreamsdev/dreamer-ui/providers';
import { RouterProvider } from 'react-router-dom';

import { AppCatalogProvider } from '@contexts/AppCatalogContext';
import { AuthProvider } from '@contexts/AuthContext';
import { router } from '@routes/AppRoutes';

function App() {
  return (
    <DreamerUIProvider>
      <AuthProvider>
        <AppCatalogProvider>
          <RouterProvider router={router} />
        </AppCatalogProvider>
      </AuthProvider>
    </DreamerUIProvider>
  );
}

export default App;
