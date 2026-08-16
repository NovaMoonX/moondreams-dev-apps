import { DreamerUIProvider } from '@moondreamsdev/dreamer-ui/providers';
import { RouterProvider } from 'react-router-dom';

import { AuthProvider } from '@contexts/AuthContext';
import { router } from '@routes/AppRoutes';

function App() {
  return (
    <DreamerUIProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </DreamerUIProvider>
  );
}

export default App;
