import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ToastProvider } from './components/Toasts';
import './index.css';

// Todo va al servidor local (127.0.0.1): que el navegador crea estar "sin red" no debe pausar
// las peticiones (si no, "Guardar" se quedaría girando y se enviaría solo más tarde).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: true, networkMode: 'always' },
    mutations: { networkMode: 'always' },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
