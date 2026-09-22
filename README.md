# Fro Grills Xperience: restaurant ordering and back office

One system for a single restaurant: a public website where customers browse the menu and order, and a staff back office for orders, the counter (POS), the kitchen screen, stock, cash, expenses and reports.

- **client/**: React 19 + JavaScript (Vite, Tailwind CSS v4, React Router)
- **server/**: Node.js + Express 5, with SQLite built into Node (no database server to install)

## What it does

| Promise | How the system delivers it |
|---|---|
| Know exactly how much you make daily | Dashboard leads with *money received today*, compared with the same time yesterday. Reports show sales, money received, expenses, net, average order and estimated food cost for any date range. |
| Track every order and staff transaction | Every order, payment, refund, cancellation, discount, price change, stock change and sign-in is stored with the staff member's name and time. The **Activity log** cannot be edited. |
| Reduce errors, missing records and revenue leakage | Prices are always calculated by the server. Cash can only be taken inside a **cash shift**; at close, the drawer is counted and any shortfall is recorded against that person. Paid orders cannot be cancelled without a recorded refund. Only managers can cancel accepted orders or give discounts, and both need a reason. The dashboard's **Leakage watch** flags served-but-unpaid orders. |
| Monitor sales, inventory and performance | Dishes have recipes, so each sale deducts ingredients. Dishes show *sold out* automatically when stock runs short. Low-stock alerts, waste and stock-count corrections are recorded. The menu screen shows each dish's food cost and profit margin. |
| Organised records whenever you need them | Search and filter every order. CSV exports for orders, daily totals, items sold, payments and expenses. Printable receipts (80 mm thermal) and a printable report. `npm run backup` makes a safe copy of the database. |
| Get discovered on Google | Each page is sent to Google with its own title, description and schema.org `Restaurant` / `Menu` / `MenuItem` data (hours, address, prices), plus a plain-HTML copy of the content. Also: an automatic `sitemap.xml`, `robots.txt`, a page per dish, and link previews for WhatsApp and social media. |
| A professional way to view the menu and order | Menu with categories, search and filters. Cart, and checkout for delivery, pickup or dine-in. Payment on delivery, by bank transfer, or online through Paystack. A live order-tracking page the customer can follow. |

### Staff roles

| Role | Can do |
|---|---|
| Owner | Everything, including staff accounts and restaurant settings |
| Manager | Menu, stock, reports, expenses, refunds, cancellations, discounts, all cash shifts, activity log |
| Cashier | Take orders at the counter, take payments, run their own cash shift, record cash paid out of their drawer |
| Kitchen | Kitchen screen only: start cooking, mark ready |

## Run it locally

Requires **Node.js 22.13 or newer** (it uses Node's built-in SQLite).

```bash
npm install
npm run seed:demo     # starter menu + 30 days of sample orders so the reports have data
npm run dev           # API on :4000, website on http://localhost:5173
```

- Website: http://localhost:5173
- Back office: http://localhost:5173/admin

Demo sign-ins (password `demo1234`): `owner@`, `manager@`, `cashier@` and `kitchen@frogrillsxperience.com`.

To start from a clean database with only the menu and an owner account (a random password is printed):

```bash
npm run seed -- --reset
```

Other commands: `npm test` (API tests), `npm run build` (build the website), `npm start` (production server), `npm run backup`.

## Going live

The site has two parts, and **both must be online**:

- **Website** on Vercel (the `client` folder). `client/vercel.json` forwards every `/api`, `/uploads`, `/sitemap.xml` and `/robots.txt` request to the server, so customers and staff only ever see the Vercel address.
- **Server** on Render (`render.yaml`). It holds the database, so it needs an always-on host with a persistent disk. Vercel can't run it.

If the website shows "not loading", the server is down or not deployed yet.

### Deploy the server on Render (once)

1. In Render: **New → Blueprint**, connect GitHub, and pick this repository. Render reads `render.yaml`.
2. When asked, enter `OWNER_PASSWORD` (the owner's first sign-in password). Add `PAYSTACK_SECRET_KEY` now or later.
3. Click **Apply**. The service must be named `fro-grills-xperience-api`, because `client/vercel.json` points at `https://fro-grills-xperience-api.onrender.com`. If Render gives it a different address, update the four URLs in `client/vercel.json`.
4. The first start creates the owner account and starter menu. Sign in at `<website>/admin`, then replace the menu, photos, address, phone and bank details.

The Starter plan (about $7/month plus $0.25 per GB of disk) is needed for the disk. On the free plan, the database is wiped whenever the server restarts.

If `SITE_URL` changes (for example to a custom domain), update it in Render's environment settings.

### Running the server anywhere else

Any always-on Node host (a VPS, or Railway with a volume) works. The server also serves the built website itself, so a single host is enough.

1. Set environment variables (see `server/.env.example`):
   - `NODE_ENV=production`
   - `JWT_SECRET`: a long random string (required)
   - `SITE_URL`: the real address, e.g. `https://frogrillsxperience.com` (used by Google and Paystack)
   - `DB_PATH` and `UPLOAD_DIR`: point both at the persistent disk, e.g. `/var/data/fro-grills-xperience.db` and `/var/data/uploads`
   - `TRUST_PROXY=1` behind one proxy (Railway, Nginx), or `2` when requests also pass through Vercel's forwarding
   - `PAYSTACK_SECRET_KEY` to switch on online payment
2. Build with `npm install && npm run build`, and start with `npm start`.
3. Run `OWNER_EMAIL=... OWNER_PASSWORD=... npm run seed` once to create the owner account and starter menu. Then replace the menu, photos, address, phone and bank details from the back office.
4. In the Paystack dashboard, set the webhook URL to `https://<website address>/api/public/payments/paystack/webhook`.
5. Schedule `npm run backup` daily and copy `data/backups/` somewhere off the server.

### Getting found on Google

1. Create a **Google Business Profile** with the same name, address and phone as in Settings, and link it to the website.
2. Add the site to **Google Search Console** and submit `https://<your-domain>/sitemap.xml`.
3. Upload real food photos. Every dish gets its own page, and photos also appear in link previews on WhatsApp and social media.
4. Fill in *Settings → Google & SEO* with the words people search for (e.g. "suya Lekki").

## How the numbers are counted

- **Sales**: the total of every order placed that day that was not cancelled, paid or not.
- **Money received**: payments actually taken that day, minus refunds. This is the cash-flow number.
- **Net**: money received minus expenses recorded that day.
- **Food cost (estimated)**: ingredients deducted by recipes, at each item's cost price when it was used.
- **Still unpaid**: orders not yet fully paid. *Served but not paid* is the leakage signal to chase.
- Days follow the restaurant's timezone (Settings → Currency & time), not the server's.

All money is stored as whole kobo, so totals never pick up rounding errors.

## Project layout

```
server/src
  app.js            Express setup, security headers, serves the built website
  seo.js            Per-page titles, schema.org data, sitemap, robots
  db/               schema.sql, seed, backup
  services/         orders (pricing, status, payments), inventory, shifts, reports, settings, menu
  routes/           public (storefront + Paystack), auth, admin/*
server/test         API tests (node --test)
client/src
  public/           website pages: home, menu, dish, checkout, order tracking
  admin/            back office: dashboard, orders, POS, kitchen, menu, inventory, shifts, expenses, reports, staff, activity, settings
  lib/              API client, formatting, cart, settings
```

Brand colours live in `client/src/index.css` (the `ember` and `coal` palettes). The name, tagline, contact details, hours, fees and payment options are all edited in the back office under Settings.
