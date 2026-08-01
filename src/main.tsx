import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/global.css';

const container = document.getElementById('root');

if (container === null) {
  throw new Error('APL Art could not start: no #root element in the document.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
