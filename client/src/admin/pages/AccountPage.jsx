import { useState } from 'react';
import { Button, Card, Input } from '../../components/ui';
import { api } from '../../lib/api';
import { ROLE_HELP, ROLE_LABEL } from '../../lib/constants';
import { useToast } from '../../lib/toast';
import { useAuth } from '../auth';
import { PageHeader } from '../components';

export default function AccountPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const mismatch = form.confirm && form.next !== form.confirm;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/api/auth/password', { currentPassword: form.current, newPassword: form.next });
      toast.success('Password changed. Other devices have been signed out.');
      setForm({ current: '', next: '', confirm: '' });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Your account" />
      <div className="grid max-w-3xl gap-5">
        <Card className="p-5 sm:p-6">
          <p className="font-display text-lg font-bold">{user.name}</p>
          <p className="text-sm text-stone-500">{user.email}</p>
          <p className="mt-3 text-sm">
            <span className="font-semibold">{ROLE_LABEL[user.role]}:</span> {ROLE_HELP[user.role]}
          </p>
        </Card>
        <Card className="p-5 sm:p-6">
          <form onSubmit={submit} className="space-y-4">
            <h2 className="font-display text-lg font-bold">Change password</h2>
            <Input label="Current password" type="password" autoComplete="current-password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="New password" type="password" autoComplete="new-password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} hint="At least 8 characters" />
              <Input label="Repeat new password" type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} error={mismatch ? 'Passwords do not match' : null} />
            </div>
            <Button type="submit" loading={busy} disabled={!form.current || form.next.length < 8 || form.next !== form.confirm}>
              Update password
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
