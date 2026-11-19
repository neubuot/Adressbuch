import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { applyTheme, getTheme } from './model/theme';
import { registerServiceWorker } from './pwa';

applyTheme(getTheme());
registerServiceWorker();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
