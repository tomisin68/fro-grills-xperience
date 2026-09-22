import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { Button, Input } from '../../components/ui';
import { useSettings } from '../../lib/settings';
import { Logo } from '../../public/shared';
import { homeFor, useAuth } from '../auth';

export default function LoginPage() {
  const { user, login, can } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={homeFor(can)} replace />;

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const signedIn = await login(email.trim(), password);
      const from = location.state?.from;
      navigate(from && from !== '/admin/login' ? from : homeFor((p) => signedIn.permissions.includes(p)), { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="ember-glow relative grid min-h-dvh place-items-center px-4 py-12">
      <title>{`Staff sign in | ${settings.restaurant.name}`}</title>
      <meta name="robots" content="noindex, nofollow" />
      <div className="grain absolute inset-0" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo name={settings.restaurant.name} />
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
          <div>
            <h1 className="font-display text-2xl font-extrabold">Staff sign in</h1>
            <p className="mt-1 text-sm text-stone-500">Orders, kitchen, stock and sales in one place.</p>
          </div>
          <Input label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          <Input label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && (
            <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            Sign in
          </Button>
          <p className="text-center text-xs text-stone-500">Forgot your password? Ask the owner to reset it from the Staff page.</p>
        </form>
        <p className="mt-6 text-center text-sm">
          <Link to="/" className="text-stone-400 hover:text-white">
            ← Back to the website
          </Link>
        </p>
      </div>
    </div>
  );
}
