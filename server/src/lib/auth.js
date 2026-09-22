import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { forbidden, unauthorized } from './errors.js';
import { can, permissionsFor } from './permissions.js';
import { sessionSecret } from './secret.js';

export const SESSION_COOKIE = 'fgx_session';

export function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: permissionsFor(user.role),
  };
}

export function setSessionCookie(res, user) {
  const token = jwt.sign({ sub: user.id, tv: user.token_version }, sessionSecret(), {
    expiresIn: `${config.sessionHours}h`,
  });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: config.sessionHours * 3600 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Resolves the signed-in staff member, or null. Deactivated users and bumped token versions are rejected. */
export function sessionUser(req) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, sessionSecret());
    const user = db.get('SELECT * FROM users WHERE id = ?', [payload.sub]);
    if (!user || !user.active || user.token_version !== payload.tv) return null;
    return user;
  } catch {
    return null;
  }
}

export function authenticate(req, _res, next) {
  const user = sessionUser(req);
  if (!user) throw unauthorized();
  req.user = user;
  next();
}

/** Allows the request when the user holds any one of the listed permissions. */
export const requirePerm = (...permissions) => (req, _res, next) => {
  if (!permissions.some((p) => can(req.user, p))) throw forbidden();
  next();
};
