import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { runHrSelfTest } from './hr/selfTest';
import { StoreProvider } from './store/StoreContext';
import './styles.css';

// Regression check of the Labour Act formulas against the fixed fixtures; failures show up in the console during development.
if (import.meta.env.DEV) {
  const r = runHrSelfTest();
  r.results.filter((x) => !x.ok).forEach((x) => console.assert(false, `HR self-test failed: ${x.name}`, x));
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <StoreProvider>
        <App />
      </StoreProvider>
    </BrowserRouter>
  </StrictMode>,
);
