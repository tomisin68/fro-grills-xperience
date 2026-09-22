import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { config } from '../config.js';
import { db, now } from '../db/index.js';
import { audit } from '../lib/audit.js';
import { HttpError, badRequest } from '../lib/errors.js';
import { authenticate, clearSessionCookie, publicUser, sessionUser, setSessionCookie } from '../lib/auth.js';
import { parse, z } from '../lib/validate.js';
import { getOpenShift } from '../services/shifts.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 1000 : 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please wait 15 minutes and try again.' },
});

// Compared against when the email is unknown, so a miss takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export const passwordSchema = z.string().min(8, 'Passwords need at least 8 characters').max(128);

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = parse(
    z.object({ email: z.string().trim().min(3).max(120), password: z.string().min(1).max(128) }),
    req.body,
  );
  const user = db.get('SELECT * FROM users WHERE email = ?', [email]);
  const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'Incorrect email or password');
  if (!user.active) throw new HttpError(403, 'This account has been deactivated. Speak to the owner.');

  db.run('UPDATE users SET last_login_at = ? WHERE id = ?', [now(), user.id]);
  setSessionCookie(res, user);
  req.user = user;
  audit(req, 'auth.login', 'user', user.id);
  res.json({ user: publicUser(user), shift: getOpenShift(user.id) });
});

router.post('/logout', (req, res) => {
  const user = sessionUser(req);
  if (user) audit({ user, ip: req.ip }, 'auth.logout', 'user', user.id);
  clearSessionCookie(res);
  res.json({ ok: true });
});

// Answers "who am I?" without an error status, so signed-out visits stay quiet.
router.get('/me', (req, res) => {
  const user = sessionUser(req);
  res.json(user ? { user: publicUser(user), shift: getOpenShift(user.id) } : { user: null, shift: null });
});

router.post('/password', authenticate, async (req, res) => {
  const { currentPassword, newPassword } = parse(
    z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }),
    req.body,
  );
  if (!(await bcrypt.compare(currentPassword, req.user.password_hash))) throw badRequest('Your current password is wrong');
  const hash = await bcrypt.hash(newPassword, 10);
  // Bumping the token version signs this account out everywhere else.
  db.run('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', [hash, req.user.id]);
  setSessionCookie(res, db.get('SELECT * FROM users WHERE id = ?', [req.user.id]));
  audit(req, 'auth.password_changed', 'user', req.user.id);
  res.json({ ok: true });
});

export default router;
