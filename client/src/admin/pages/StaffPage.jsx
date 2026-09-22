import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, cx, ErrorState, Input, Modal, PageLoader, Switch } from '../../components/ui';
import { api } from '../../lib/api';
import { ROLE_HELP, ROLE_LABEL } from '../../lib/constants';
import { dateTime } from '../../lib/format';
import { useApi } from '../../lib/hooks';
import { useToast } from '../../lib/toast';
import { useAuth } from '../auth';
import { PageHeader, Table, Td, Th } from '../components';

const ROLE_TONE = { owner: 'dark', manager: 'ember', cashier: 'sky', kitchen: 'violet' };

function StaffModal({ member, roles, onClose, onSaved }) {
  const toast = useToast();
  const { user } = useAuth();
  const isSelf = member?.id === user.id;
  const [form, setForm] = useState({
    name: member?.name ?? '',
    email: member?.email ?? '',
    role: member?.role ?? 'cashier',
    active: member ? Boolean(member.active) : true,
    password: '',
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const body = { name: form.name.trim(), email: form.email.trim(), role: form.role };
      if (form.password) body.password = form.password;
      if (member) await api.patch(`/api/admin/staff/${member.id}`, { ...body, active: form.active });
      else await api.post('/api/admin/staff', { ...body, password: form.password });
      toast.success(member ? 'Staff member updated' : `${body.name} can now sign in`);
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={member ? `Edit ${member.name}` : 'Add a staff member'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!form.name.trim() || !form.email.trim() || (!member && form.password.length < 8)} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Email (used to sign in)" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium">Role</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {roles.map((r) => (
              <button
                key={r}
                type="button"
                disabled={isSelf}
                onClick={() => setForm({ ...form, role: r })}
                className={cx(
                  'rounded-xl p-3 text-left ring-1 transition disabled:cursor-not-allowed disabled:opacity-60',
                  form.role === r ? 'bg-ember-50 ring-2 ring-ember-500' : 'ring-stone-200 hover:ring-stone-300',
                )}
              >
                <p className="font-semibold">{ROLE_LABEL[r]}</p>
                <p className="mt-0.5 text-xs text-stone-500">{ROLE_HELP[r]}</p>
              </button>
            ))}
          </div>
        </div>
        <Input
          label={member ? 'New password (leave empty to keep the current one)' : 'Password'}
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          hint="At least 8 characters. Changing it signs them out everywhere."
        />
        {member && !isSelf && (
          <Switch checked={form.active} onChange={(active) => setForm({ ...form, active })} label="Can sign in" description="Turn off when someone leaves. Their history stays." />
        )}
      </div>
    </Modal>
  );
}

export default function StaffPage() {
  const { data, error, loading, reload } = useApi('/api/admin/staff');
  const [editing, setEditing] = useState(null);

  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        title="Staff"
        description="Give everyone their own sign-in so every order, payment and change is recorded against a name."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" /> Add staff
          </Button>
        }
      />
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Last sign-in</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {data.staff.map((m) => (
              <tr key={m.id} className={cx(!m.active && 'opacity-60')}>
                <Td>
                  <p className="font-semibold">{m.name}</p>
                  <p className="text-xs text-stone-500">{m.email}</p>
                </Td>
                <Td>
                  <Badge tone={ROLE_TONE[m.role]}>{ROLE_LABEL[m.role]}</Badge>
                </Td>
                <Td>{m.active ? <Badge tone="emerald">Active</Badge> : <Badge>Deactivated</Badge>}</Td>
                <Td className="text-stone-600">{m.last_login_at ? dateTime(m.last_login_at) : 'Never'}</Td>
                <Td align="right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(m)}>
                    <Pencil className="size-4" /> Edit
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      {editing && <StaffModal member={editing === 'new' ? null : editing} roles={data.roles} onClose={() => setEditing(null)} onSaved={reload} />}
    </>
  );
}
