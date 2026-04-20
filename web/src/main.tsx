import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import './i18n';
import './index.css';
import App from './App.tsx';
import {
  bootstrapTheme,
  ThemeProvider,
} from '@/modules/shared/theme/theme-provider';

// Apply the stored theme class on <html> BEFORE React renders so the
// first paint is already in the right palette — no flash.
bootstrapTheme();

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (typeof sentryDsn === 'string' && sentryDsn.length > 0) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
