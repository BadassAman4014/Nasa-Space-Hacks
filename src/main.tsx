import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { I18nProvider } from './i18n';
import './index.css';
import './styles/tokens.css';
import './styles/shell.css';
import './styles/dashboard.css';
import './styles/compact.css';
import './components/layout/floating-sidebar.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>
);
