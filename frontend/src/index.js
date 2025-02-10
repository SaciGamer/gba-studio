import React from 'react';
import ReactDOM from 'react-dom/client';
import fs, { getElectronPath } from 'fs';
// import './index.css';
import Launcher from './components/launcher/Launcher.tsx';
import App from './App.tsx';

if (typeof window === 'undefined') {
  // Código Node.js
  const electronPath = getElectronPath();
  // Outras operações com fs
} else {
  // Código do navegador
  console.log('Não é possível usar fs no navegador');
}

// -------------------------------------------------------------------- //
console.warn('index.js is loaded');
// -------------------------------------------------------------------- //

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Failed to find the root element');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode >
    <App/>
  </React.StrictMode>
);