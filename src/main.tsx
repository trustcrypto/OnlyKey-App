import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initTheme } from './utils/theme';

initTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if (typeof nw !== 'undefined') {
  import('./desktop/initDesktop').then((m) => m.initDesktop()).catch(console.error);
}