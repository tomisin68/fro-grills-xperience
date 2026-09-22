import crypto from 'node:crypto';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { bus, openEventStream } from '../lib/events.js';
import { initializeTransaction, isValidWebhook, paystackEnabled, verifyTransaction } from '../lib/paystack.js';
import { optionalText, parse, z } from '../lib/validate.js';
import { publicMenu, publicMenuItem } from '../services/menu.js';
import { applyOnlinePayment, createOrder, publicOrderView } from '../services/orders.js';
import { getSettings, publicSettings } from '../services/settings.js';

const router = Router();

const orderLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: config.isTest ? 1000 : 15,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many orders from this connection. Please wait a few minutes and try again.' },
});

const emailish = z
  .string()
  .trim()
  .max(120)
  .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Enter a valid email address')
  .optional()
  .default('');

const orderSchema = z.object({
  type: z.enum(['delivery', 'pickup', 'dine_in'], { error: 'Choose delivery, pickup or dine-in' }),
  customer: z.object({
    name: z.string().trim().min(2, 'Enter your name').max(80),
    phone: z.string().trim().regex(/^[+\d][\d\s-]{6,19}$/, 'Enter a valid phone number'),
    email: emailish,
  }),
  deliveryAddress: optionalText(300),
  tableNumber: optionalText(20),
  notes: optionalText(500),
  paymentMethod: z.enum(['cash', 'transfer', 'online'], { error: 'Choose how you will pay' }),
  items: z
    .array(
      z.object({
        menuItemId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(50),
        notes: optionalText(200),
      }),
    )
    .min(1, 'Your cart is empty')
    .max(40),
});

function findOrder(number, token) {
  const order = db.get('SELECT id, tracking_token FROM orders WHERE order_number = ?', [String(number)]);
  const a = Buffer.from(order?.tracking_token ?? '');
  const b = Buffer.from(String(token ?? ''));
  if (!order || a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw notFound('Order not found');
  return order;
}

async function startOnlinePayment(orderId) {
  const order = db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
  const due = order.total - order.amount_paid;
  if (due <= 0) throw conflict('This order is already paid');
  if (order.status === 'cancelled') throw conflict('This order was cancelled');
  if (!paystackEnabled()) throw conflict('Online payment is not available right now');
  // The order number prefix lets any reference, even an abandoned earlier attempt, be traced back.
  const reference = `${order.order_number}-${crypto.randomBytes(5).toString('hex')}`;
  db.run('UPDATE orders SET payment_reference = ? WHERE id = ?', [reference, order.id]);
  const data = await initializeTransaction({
    email: order.customer_email,
    amount: due,
    currency: getSettings().locale.currency,
    reference,
    callbackUrl: `${config.siteUrl}/payment/callback`,
    metadata: { order_number: order.order_number },
  });
  return data.authorization_url;
}

/** Verifies a reference with Paystack and credits the order it belongs to. */
async function settleReference(reference) {
  const data = await verifyTransaction(reference);
  if (data.status !== 'success') return { paid: false, status: data.status };
  const orderNumber = reference.slice(0, reference.lastIndexOf('-'));
  const order = db.get('SELECT id, order_number, tracking_token FROM orders WHERE order_number = ?', [orderNumber]);
  if (!order) return { paid: false, status: 'unknown_order' };
  applyOnlinePayment({ orderId: order.id, reference, amount: data.amount, currency: data.currency });
  return { paid: true, order };
}

router.get('/settings', (_req, res) => res.json(publicSettings()));

router.get('/menu', (_req, res) => res.json({ categories: publicMenu() }));

router.get('/menu/:slug', (req, res) => res.json(publicMenuItem(req.params.slug)));

router.post('/orders', orderLimiter, async (req, res) => {
  const input = parse(orderSchema, req.body);
  const order = createOrder(input, { channel: 'online' });
  let paymentUrl = null;
  let paymentError = null;
  if (order.payment_method === 'online') {
    try {
      paymentUrl = await startOnlinePayment(order.id);
    } catch (err) {
      paymentError = err.message;
    }
  }
  res.status(201).json({
    order_number: order.order_number,
    token: order.tracking_token,
    total: order.total,
    payment_url: paymentUrl,
    payment_error: paymentError,
  });
});

router.get('/orders/:number', (req, res) => {
  const order = findOrder(req.params.number, req.query.token);
  res.json(publicOrderView(order.id));
});

router.get('/orders/:number/stream', (req, res) => {
  const order = findOrder(req.params.number, req.query.token);
  const send = openEventStream(req, res, () => bus.off('order', onOrder));
  const onOrder = (e) => {
    if (e.order.id === order.id) send('order', publicOrderView(order.id));
  };
  bus.on('order', onOrder);
});

router.post('/orders/:number/pay', orderLimiter, async (req, res) => {
  const order = findOrder(req.params.number, req.body?.token);
  const full = db.get('SELECT payment_method, customer_email FROM orders WHERE id = ?', [order.id]);
  if (full.payment_method !== 'online' || !full.customer_email) throw badRequest('This order is not set up for online payment');
  res.json({ payment_url: await startOnlinePayment(order.id) });
});

router.post('/payments/paystack/verify', async (req, res) => {
  const { reference } = parse(z.object({ reference: z.string().trim().min(3).max(100) }), req.body);
  const result = await settleReference(reference);
  if (!result.order) throw badRequest('We could not confirm that payment. If you were charged, please contact us.');
  res.json({ paid: result.paid, order_number: result.order.order_number, token: result.order.tracking_token });
});

/** Mounted in app.js with a raw body parser, because the signature covers the exact bytes. */
export async function paystackWebhook(req, res) {
  if (!paystackEnabled() || !isValidWebhook(req.body, req.get('x-paystack-signature'))) {
    return res.sendStatus(401);
  }
  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.sendStatus(400);
  }
  if (event.event === 'charge.success' && event.data?.reference) {
    try {
      // Re-verify rather than trusting the payload's amount.
      await settleReference(event.data.reference);
    } catch (err) {
      audit(null, 'payment.webhook_error', 'payment', event.data.reference, { error: err.message });
      return res.sendStatus(500);
    }
  }
  res.sendStatus(200);
}

export default router;
