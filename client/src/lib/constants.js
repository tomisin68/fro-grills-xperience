export const ORDER_STATUS = {
  pending: { label: 'New', tone: 'amber' },
  confirmed: { label: 'Accepted', tone: 'sky' },
  preparing: { label: 'On the grill', tone: 'violet' },
  ready: { label: 'Ready', tone: 'emerald' },
  out_for_delivery: { label: 'Out for delivery', tone: 'indigo' },
  completed: { label: 'Completed', tone: 'stone' },
  cancelled: { label: 'Cancelled', tone: 'rose' },
};

export const PAYMENT_STATUS = {
  unpaid: { label: 'Unpaid', tone: 'rose' },
  partial: { label: 'Part paid', tone: 'amber' },
  paid: { label: 'Paid', tone: 'emerald' },
  refunded: { label: 'Refunded', tone: 'stone' },
};

export const ORDER_TYPE = {
  delivery: 'Delivery',
  pickup: 'Pickup',
  dine_in: 'Dine-in',
};

export const PAYMENT_METHOD = {
  cash: 'Cash',
  card: 'Card / POS',
  transfer: 'Bank transfer',
  online: 'Paid online',
};

export const ROLE_LABEL = {
  owner: 'Owner',
  manager: 'Manager',
  cashier: 'Cashier',
  kitchen: 'Kitchen',
};

export const ROLE_HELP = {
  owner: 'Everything, including staff accounts and restaurant settings.',
  manager: 'Runs the floor: menu, stock, reports, refunds, cancellations and discounts.',
  cashier: 'Takes orders and payments at the counter and runs a cash drawer shift.',
  kitchen: 'Sees the kitchen screen and marks orders as cooking and ready.',
};

export const TAG_LABEL = {
  spicy: 'Spicy',
  vegetarian: 'Vegetarian',
  popular: 'Popular',
  new: 'New',
  'chef-special': "Chef's special",
  'gluten-free': 'Gluten-free',
};

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Which stages follow each status, for the next-step buttons. */
export function nextStatuses(order) {
  const flow = ['pending', 'confirmed', 'preparing', 'ready', ...(order.type === 'delivery' ? ['out_for_delivery'] : []), 'completed'];
  const i = flow.indexOf(order.status);
  return i === -1 ? [] : flow.slice(i + 1);
}

export const NEXT_ACTION = {
  confirmed: 'Accept order',
  preparing: 'Start cooking',
  ready: 'Mark ready',
  out_for_delivery: 'Send out for delivery',
  completed: 'Complete order',
};
