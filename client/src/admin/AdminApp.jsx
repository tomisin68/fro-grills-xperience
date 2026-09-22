import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { PageLoader } from '../components/ui';
import AccountPage from './pages/AccountPage';
import ActivityPage from './pages/ActivityPage';
import ExpensesPage from './pages/ExpensesPage';
import InventoryPage from './pages/InventoryPage';
import KitchenPage from './pages/KitchenPage';
import LoginPage from './pages/LoginPage';
import MenuManagerPage from './pages/MenuManagerPage';
import OrdersPage from './pages/OrdersPage';
import PosPage from './pages/PosPage';
import ReceiptPage from './pages/ReceiptPage';
import SettingsPage from './pages/SettingsPage';
import ShiftsPage from './pages/ShiftsPage';
import StaffPage from './pages/StaffPage';
import AdminLayout from './AdminLayout';
import { AuthProvider, Guard, homeFor, RequireAuth, useAuth } from './auth';

// The chart-heavy screens load separately so the POS and kitchen stay light.
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));

function Home() {
  const { can } = useAuth();
  return <Navigate to={homeFor(can)} replace />;
}

const page = (perm, element) => (
  <Guard perm={perm}>
    <Suspense fallback={<PageLoader />}>{element}</Suspense>
  </Guard>
);

export default function AdminApp() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route
          path="orders/:id/receipt"
          element={
            <RequireAuth>
              <ReceiptPage />
            </RequireAuth>
          }
        />
        <Route
          element={
            <RequireAuth>
              <AdminLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Home />} />
          <Route path="dashboard" element={page('dashboard.view', <DashboardPage />)} />
          <Route path="orders" element={page('orders.view', <OrdersPage />)} />
          <Route path="pos" element={page('orders.create', <PosPage />)} />
          <Route path="kitchen" element={page('kitchen.view', <KitchenPage />)} />
          <Route path="menu" element={page('menu.manage', <MenuManagerPage />)} />
          <Route path="inventory" element={page('inventory.view', <InventoryPage />)} />
          <Route path="reports" element={page('reports.view', <ReportsPage />)} />
          <Route path="expenses" element={page('expenses.view', <ExpensesPage />)} />
          <Route path="shifts" element={page('shifts.use', <ShiftsPage />)} />
          <Route path="staff" element={page('staff.manage', <StaffPage />)} />
          <Route path="activity" element={page('audit.view', <ActivityPage />)} />
          <Route path="settings" element={page('settings.manage', <SettingsPage />)} />
          <Route path="account" element={<AccountPage />} />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
