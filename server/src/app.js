import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { authenticate } from './lib/auth.js';
import { HttpError } from './lib/errors.js';
import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/admin/catalog.js';
import financeRoutes from './routes/admin/finance.js';
import inventoryRoutes from './routes/admin/inventory.js';
import orderRoutes from './routes/admin/orders.js';
import teamRoutes from './routes/admin/team.js';
import publicRoutes, { paystackWebhook } from './routes/public.js';
import { renderIndex, robotsTxt, sitemapXml } from './seo.js';

function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request body is not valid JSON' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'The request is too large' });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Images must be 5 MB or smaller' });
  if (err.code === 'ERR_SQLITE_ERROR' && /UNIQUE constraint failed/.test(err.message)) {
    return res.status(409).json({ error: 'That record already exists' });
  }
  const status = err.status ?? err.statusCode;
  if (status >= 400 && status < 500) return res.status(status).json({ error: status === 404 ? 'Not found' : 'Bad request' });
  console.error(`[${req.method} ${req.originalUrl}]`, err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'img-src': ["'self'", 'data:', 'blob:', 'https:'],
          'frame-src': ["'self'", 'https://www.google.com', 'https://maps.google.com'],
          'connect-src': ["'self'"],
          'upgrade-insecure-requests': config.siteUrl.startsWith('https://') ? [] : null,
        },
      },
      strictTransportSecurity: config.siteUrl.startsWith('https://'),
    }),
  );
  // Event streams must not be buffered by compression.
  app.use(compression({ filter: (req, res) => req.headers.accept !== 'text/event-stream' && compression.filter(req, res) }));
  app.use(cookieParser());

  // Paystack signs the exact bytes it sends, so this route needs the raw body.
  app.post('/api/public/payments/paystack/webhook', express.raw({ type: '*/*', limit: '1mb' }), paystackWebhook);
  app.use(express.json({ limit: '200kb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/public', publicRoutes);
  app.use('/api/auth', authRoutes);

  const admin = express.Router();
  admin.use(authenticate);
  admin.use(orderRoutes, catalogRoutes, inventoryRoutes, financeRoutes, teamRoutes);
  app.use('/api/admin', admin);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  app.use('/uploads', express.static(config.uploadDir, { maxAge: '30d', fallthrough: false }));
  app.get('/robots.txt', (_req, res) => res.type('text/plain').send(robotsTxt()));
  app.get('/sitemap.xml', (_req, res) => res.type('application/xml').send(sitemapXml()));

  // In production the built storefront and admin are served from here.
  const indexFile = path.join(config.clientDist, 'index.html');
  if (fs.existsSync(indexFile)) {
    const template = fs.readFileSync(indexFile, 'utf8');
    app.use(
      express.static(config.clientDist, {
        index: false,
        setHeaders: (res, file) => {
          const hashed = file.includes(`${path.sep}assets${path.sep}`);
          res.setHeader('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
        },
      }),
    );
    app.get('/{*path}', (req, res) => {
      const { status, html } = renderIndex(template, req.path);
      res.status(status).set('Cache-Control', 'no-cache').type('html').send(html);
    });
  }

  app.use(errorHandler);
  return app;
}
