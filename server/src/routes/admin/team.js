import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { db, now } from '../../db/index.js';
import { audit } from '../../lib/audit.js';
import { requirePerm } from '../../lib/auth.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { paystackEnabled } from '../../lib/paystack.js';
import { ROLES } from '../../lib/permissions.js';
import { addDays, isValidTimezone, startOfLocalDay } from '../../lib/time.js';
import { dateStr, id, money, parse, text, z } from '../../lib/validate.js';
import { getSettings, timezone, updateSettings } from '../../services/settings.js';
import { passwordSchema } from '../auth.js';

const router = Router();

// ------------------------------------------------------------ staff

const email = z.string().trim().toLowerCase().max(120).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address');

const STAFF_COLUMNS = 'id, name, email, role, active, last_login_at, created_at';

function activeOwners(excludeId) {
  return db.get("SELECT COUNT(*) AS n FROM users WHERE role = 'owner' AND active = 1 AND id != ?", [excludeId]).n;
}

router.get('/staff', requirePerm('staff.manage'), (_req, res) => {
  res.json({ staff: db.all(`SELECT ${STAFF_COLUMNS} FROM users ORDER BY active DESC, name`), roles: ROLES });
});

router.post('/staff', requirePerm('staff.manage'), async (req, res) => {
  const body = parse(z.object({ name: text(80, 2), email, role: z.enum(ROLES), password: passwordSchema }), req.body);
  if (db.get('SELECT id FROM users WHERE email = ?', [body.email])) throw conflict('Someone already uses that email');
  const { lastInsertRowid } = db.run(
    'INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)',
    [body.name, body.email, await bcrypt.hash(body.password, 10), body.role, now()],
  );
  audit(req, 'staff.create', 'user', lastInsertRowid, { name: body.name, email: body.email, role: body.role });
  res.status(201).json({ member: db.get(`SELECT ${STAFF_COLUMNS} FROM users WHERE id = ?`, [lastInsertRowid]) });
});

router.patch('/staff/:id', requirePerm('staff.manage'), async (req, res) => {
  const userId = parse(id, req.params.id);
  const current = db.get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!current) throw notFound('Staff member not found');
  const body = parse(
    z.object({ name: text(80, 2), email, role: z.enum(ROLES), active: z.boolean(), password: passwordSchema }).partial(),
    req.body,
  );
  const isSelf = userId === req.user.id;
  if (isSelf && body.role && body.role !== current.role) throw badRequest('You cannot change your own role');
  if (isSelf && body.active === false) throw badRequest('You cannot deactivate your own account');
  const losingOwner = current.role === 'owner' && ((body.role && body.role !== 'owner') || body.active === false);
  if (losingOwner && activeOwners(userId) === 0) throw conflict('There must always be at least one active owner');
  if (body.email && body.email !== current.email && db.get('SELECT id FROM users WHERE email = ? AND id != ?', [body.email, userId])) {
    throw conflict('Someone already uses that email');
  }

  // Changing a password, role or access signs that person out of every device.
  const revoke = Boolean(body.password) || (body.role && body.role !== current.role) || body.active === false;
  db.run(
    `UPDATE users SET name = ?, email = ?, role = ?, active = ?, password_hash = ?, token_version = token_version + ?
     WHERE id = ?`,
    [
      body.name ?? current.name,
      body.email ?? current.email,
      body.role ?? current.role,
      body.active ?? Boolean(current.active),
      body.password ? await bcrypt.hash(body.password, 10) : current.password_hash,
      revoke ? 1 : 0,
      userId,
    ],
  );
  const { password, ...logged } = body;
  audit(req, 'staff.update', 'user', userId, { name: current.name, ...logged, password_reset: password ? true : undefined });
  res.json({ member: db.get(`SELECT ${STAFF_COLUMNS} FROM users WHERE id = ?`, [userId]) });
});

// ------------------------------------------------------------ activity log

router.get('/audit', requirePerm('audit.view'), (req, res) => {
  const q = parse(
    z.object({
      userId: id.optional(),
      action: z.string().trim().max(60).optional(),
      from: dateStr.optional(),
      to: dateStr.optional(),
      page: z.coerce.number().int().min(1).optional().default(1),
    }),
    req.query,
  );
  const where = [];
  const params = [];
  const tz = timezone();
  // Log times are stored in UTC; the dates picked are the restaurant's local days.
  for (const [sql, value] of [
    ['user_id = ?', q.userId],
    ['action LIKE ?', q.action && `${q.action.replace(/[%_]/g, '')}%`],
    ['created_at >= ?', q.from && startOfLocalDay(tz, q.from).toISOString()],
    ['created_at < ?', q.to && startOfLocalDay(tz, addDays(q.to, 1)).toISOString()],
  ]) {
    if (!value) continue;
    where.push(sql);
    params.push(value);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const pageSize = 100;
  const { count } = db.get(`SELECT COUNT(*) AS count FROM audit_logs ${clause}`, params);
  const rows = db.all(`SELECT * FROM audit_logs ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`, [
    ...params,
    pageSize,
    (q.page - 1) * pageSize,
  ]);
  res.json({
    rows: rows.map((r) => ({ ...r, details: r.details ? JSON.parse(r.details) : null })),
    count,
    page: q.page,
    pageSize,
    users: db.all('SELECT id, name FROM users ORDER BY name'),
  });
});

// ------------------------------------------------------------ settings

const str = (max) => z.string().trim().max(max);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM times');

// No defaults anywhere here: every section is a partial patch merged into what is stored.
const settingsSchema = z
  .object({
    restaurant: z
      .object({
        name: str(80).min(1, 'The restaurant needs a name'),
        tagline: str(160),
        description: str(1000),
        phone: str(40),
        email: str(120),
        whatsapp: str(40),
        address: str(200),
        city: str(80),
        state: str(80),
        country: str(2),
        postalCode: str(20),
        cuisine: z.array(str(40)).max(10),
        priceRange: str(5),
        logoUrl: str(500),
        heroImageUrl: str(500),
        mapEmbedUrl: str(1000).refine((v) => !v || v.startsWith('https://www.google.com/maps/embed'), 'Paste the Google Maps embed link (it starts with https://www.google.com/maps/embed)'),
        social: z.object({ instagram: str(200), facebook: str(200), x: str(200), tiktok: str(200) }).partial(),
      })
      .partial(),
    hours: z
      .array(z.object({ day: z.number().int().min(0).max(6), closed: z.boolean(), open: time, close: time }))
      .length(7)
      .refine((days) => new Set(days.map((d) => d.day)).size === 7, 'Each day of the week must appear once'),
    ordering: z
      .object({
        acceptingOrders: z.boolean(),
        delivery: z.boolean(),
        pickup: z.boolean(),
        dineIn: z.boolean(),
        autoAccept: z.boolean(),
        deliveryFee: money,
        minOrder: money,
        taxRate: z.number().min(0).max(50),
        estimatedMinutes: z.number().int().min(5).max(240),
        deliveryNote: str(300),
      })
      .partial(),
    payments: z
      .object({
        cash: z.boolean(),
        transfer: z.boolean(),
        online: z.boolean(),
        bankName: str(80),
        accountName: str(120),
        accountNumber: str(30),
      })
      .partial(),
    locale: z
      .object({
        currency: z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code such as NGN'),
        locale: str(20).min(2),
        timezone: z.string().refine(isValidTimezone, 'Unknown timezone'),
      })
      .partial(),
    seo: z.object({ title: str(70), description: str(170), keywords: str(300) }).partial(),
  })
  .partial();

router.get('/settings', requirePerm('settings.manage'), (_req, res) => {
  res.json({ settings: getSettings(), paystack_configured: paystackEnabled() });
});

router.put('/settings', requirePerm('settings.manage'), (req, res) => {
  const patch = parse(settingsSchema, req.body);
  const settings = updateSettings(patch);
  audit(req, 'settings.update', 'settings', null, { sections: Object.keys(patch), ...patch });
  res.json({ settings, paystack_configured: paystackEnabled() });
});

export default router;
