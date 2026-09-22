import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import ErrorBoundary from './components/ErrorBoundary';
import { PageLoader } from './components/ui';
import PublicLayout from './public/PublicLayout';
import CheckoutPage from './public/CheckoutPage';
import HomePage from './public/HomePage';
import MenuItemPage from './public/MenuItemPage';
import MenuPage from './public/MenuPage';
import NotFoundPage from './public/NotFoundPage';
import PaymentCallbackPage from './public/PaymentCallbackPage';
import TrackOrderPage from './public/TrackOrderPage';

// Staff screens (and their chart library) load only when someone opens /admin.
const AdminApp = lazy(() => import('./admin/AdminApp'));

function ScrollToTop() {
  const { pathname } = useLocation();
  // Block body on purpose: newer browsers make scrollTo() return a Promise,
  // which React would mistake for a cleanup function.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary resetKey={pathname}>
      <ScrollToTop />
      <Routes>
        <Route
          path="/admin/*"
          element={
            <Suspense fallback={<PageLoader />}>
              <AdminApp />
            </Suspense>
          }
        />
        <Route element={<PublicLayout />}>
          <Route index element={<HomePage />} />
          <Route path="menu" element={<MenuPage />} />
          <Route path="menu/:slug" element={<MenuItemPage />} />
          <Route path="checkout" element={<CheckoutPage />} />
          <Route path="track/:number" element={<TrackOrderPage />} />
          <Route path="payment/callback" element={<PaymentCallbackPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
