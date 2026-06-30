import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RealtimeStatusBanner } from './components/RealtimeStatusBanner';
import '@ovhcloud/ods-react/normalize-css';
import '@ovhcloud/ods-themes/default/css';
import '@ovhcloud/ods-themes/default/fonts';
import './src/ui/theme/ods-dark.css';
import './src/ui/theme/ods-light.css';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <RealtimeStatusBanner />
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
