import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Tema: segue Windows (prefers-color-scheme). `?theme=dark|light` forza un tema, utile per verifiche.
const forced = new URLSearchParams(location.search).get('theme');
if (forced === 'dark' || forced === 'light') document.documentElement.dataset.theme = forced;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
