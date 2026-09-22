import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';
import './index.css';
import { CartProvider } from './lib/cart';
import { SettingsProvider } from './lib/settings';
import { ToastProvider } from './lib/toast';

// The server writes page-specific <title>/<meta> tags for crawlers. From here on
// each page renders its own, so drop the server's copies to avoid duplicates.
document.querySelectorAll('[data-seo]').forEach((el) => el.remove());

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <SettingsProvider>
          <CartProvider>
            <App />
          </CartProvider>
        </SettingsProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
