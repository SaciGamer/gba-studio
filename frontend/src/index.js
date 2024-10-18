import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import fs, { getElectronPath } from 'fs';
import App from './App.tsx';
import './index.css';
// import reportWebVitals from './reportWebVitals';

if (typeof window === 'undefined') {
  // Código Node.js
  const electronPath = getElectronPath();
  // Outras operações com fs
} else {
  // Código do navegador
  console.log('Não é possível usar fs no navegador');
}

// -------------------------------------------------------------------- //

console.warn('index.js is loaded'); // Adicione este log para verificar

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

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
// reportWebVitals(console.log);