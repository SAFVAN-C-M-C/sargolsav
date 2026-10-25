import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppThemeProvider } from './providers/AppThemeProvider';

const router = createBrowserRouter([{ path: '*', element: <App /> }]);
createRoot(document.getElementById('root')!).render(
  <StrictMode><AppThemeProvider><RouterProvider router={router} /></AppThemeProvider></StrictMode>,
);
