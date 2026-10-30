import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { CashierAccessPage } from './components/CashierAccessPage';
import './index.css';
import { startLocalisation } from './utils/i18n';
import { AppErrorBoundary } from './components/AppErrorBoundary';

startLocalisation();
const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('COTRIX root element #root was not found');
createRoot(rootElement).render(
  <AppErrorBoundary>
    {location.pathname === '/cashier' ? <CashierAccessPage /> : <App />}
  </AppErrorBoundary>
);
