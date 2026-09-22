export const ROLES = ['owner', 'manager', 'cashier', 'kitchen'];

const ROLE_PERMISSIONS = {
  manager: [
    'dashboard.view',
    'orders.view', 'orders.create', 'orders.update', 'orders.cancel', 'orders.discount',
    'payments.record', 'payments.refund',
    'kitchen.view', 'kitchen.update',
    'menu.manage',
    'inventory.view', 'inventory.manage',
    'reports.view',
    'expenses.view', 'expenses.create', 'expenses.delete',
    'shifts.use', 'shifts.viewAll',
    'audit.view',
  ],
  cashier: [
    'orders.view', 'orders.create', 'orders.update',
    'payments.record',
    'kitchen.view', 'kitchen.update',
    'inventory.view',
    'expenses.create',
    'shifts.use',
  ],
  kitchen: ['kitchen.view', 'kitchen.update', 'inventory.view'],
};

// The owner holds every permission, including the two nobody else gets.
const ALL = [...new Set([...Object.values(ROLE_PERMISSIONS).flat(), 'staff.manage', 'settings.manage'])];

export function permissionsFor(role) {
  return role === 'owner' ? ALL : ROLE_PERMISSIONS[role] ?? [];
}

export function can(user, permission) {
  return Boolean(user) && permissionsFor(user.role).includes(permission);
}
