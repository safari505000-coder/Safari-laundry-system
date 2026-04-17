import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import './i18n';
import './index.css';
import App from './App.tsx';

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
    <App />
  </StrictMode>,
);
