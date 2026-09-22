import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { PageLoader } from '../components/ui';
import { api } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, shift: null, loading: true });

  const refresh = useCallback(async () => {
    try {
      const { user, shift } = await api.get('/api/auth/me');
      setState({ user, shift, loading: false });
    } catch {
      setState({ user: null, shift: null, loading: false });
    }
  }, []);

  useEffect(() => {
    refresh();
    const expired = () => setState({ user: null, shift: null, loading: false });
    window.addEventListener('auth:expired', expired);
    return () => window.removeEventListener('auth:expired', expired);
  }, [refresh]);

  const value = useMemo(
    () => ({
      ...state,
      refresh,
      can: (permission) => Boolean(state.user?.permissions.includes(permission)),
      setShift: (shift) => setState((s) => ({ ...s, shift })),
      async login(email, password) {
        const { user, shift } = await api.post('/api/auth/login', { email, password });
        setState({ user, shift, loading: false });
        return user;
      },
      async logout() {
        await api.post('/api/auth/logout').catch(() => {});
        setState({ user: null, shift: null, loading: false });
      },
    }),
    [state, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  return children;
}

/** The first screen each role should land on. */
export function homeFor(can) {
  if (can('dashboard.view')) return '/admin/dashboard';
  if (can('orders.create')) return '/admin/pos';
  if (can('kitchen.view')) return '/admin/kitchen';
  return '/admin/account';
}

export function Guard({ perm, children }) {
  const { can } = useAuth();
  const perms = Array.isArray(perm) ? perm : [perm];
  if (!perms.some(can)) return <Navigate to={homeFor(can)} replace />;
  return children;
}
