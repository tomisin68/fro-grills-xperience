import { config } from './config.js';
import { db } from './db/index.js';
import { publicMenu, publicMenuItem } from './services/menu.js';
import { formatMoney, getSettings, publicSettings } from './services/settings.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const absolute = (url) => {
  if (!url) return '';
  if (/^https?:\/\//.test(url)) return url;
  return `${config.siteUrl}${url.startsWith('/') ? '' : '/'}${url}`;
};

const jsonLd = (data) =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

const SCHEMA_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function menuItemSchema(item, currency) {
  return {
    '@type': 'MenuItem',
    name: item.name,
    description: item.description || undefined,
    url: `${config.siteUrl}/menu/${item.slug}`,
    image: absolute(item.image_url) || undefined,
    offers: {
      '@type': 'Offer',
      price: (item.price / 100).toFixed(2),
      priceCurrency: currency,
      availability: item.sold_out ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
    },
    suitableForDiet: item.tags.includes('vegetarian') ? 'https://schema.org/VegetarianDiet' : undefined,
  };
}

/** schema.org Restaurant, which Google uses for rich results and the local knowledge panel. */
export function restaurantSchema(settings, menu) {
  const r = settings.restaurant;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    '@id': `${config.siteUrl}/#restaurant`,
    name: r.name,
    description: r.description,
    url: config.siteUrl,
    telephone: r.phone || undefined,
    email: r.email || undefined,
    image: [absolute(r.heroImageUrl), absolute(r.logoUrl)].filter(Boolean),
    logo: absolute(r.logoUrl) || undefined,
    servesCuisine: r.cuisine,
    priceRange: r.priceRange || undefined,
    address: {
      '@type': 'PostalAddress',
      streetAddress: r.address,
      addressLocality: r.city,
      addressRegion: r.state,
      postalCode: r.postalCode || undefined,
      addressCountry: r.country,
    },
    openingHoursSpecification: settings.hours
      .filter((h) => !h.closed)
      .map((h) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: `https://schema.org/${SCHEMA_DAYS[h.day]}`, opens: h.open, closes: h.close })),
    sameAs: Object.values(r.social || {}).filter(Boolean),
    hasMenu: `${config.siteUrl}/menu`,
    potentialAction: {
      '@type': 'OrderAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${config.siteUrl}/menu`, actionPlatform: ['https://schema.org/DesktopWebPlatform', 'https://schema.org/MobileWebPlatform'] },
      deliveryMethod: [
        settings.ordering.delivery && 'http://purl.org/goodrelations/v1#DeliveryModeOwnFleet',
        settings.ordering.pickup && 'http://purl.org/goodrelations/v1#DeliveryModePickUp',
      ].filter(Boolean),
    },
  };
  if (!data.image.length) delete data.image;
  if (menu) {
    data.hasMenu = {
      '@type': 'Menu',
      name: `${r.name} menu`,
      url: `${config.siteUrl}/menu`,
      hasMenuSection: menu.map((c) => ({
        '@type': 'MenuSection',
        name: c.name,
        description: c.description || undefined,
        hasMenuItem: c.items.map((i) => menuItemSchema(i, settings.locale.currency)),
      })),
    };
  }
  return data;
}

function hoursHtml(settings) {
  return `<ul>${settings.hours
    .map((h) => `<li>${DAY_LABELS[h.day]}: ${h.closed ? 'Closed' : `${esc(h.open)} – ${esc(h.close)}`}</li>`)
    .join('')}</ul>`;
}

function addressLine(r) {
  return [r.address, r.city, r.state].filter(Boolean).join(', ');
}

/** Builds the head tags and crawlable body for a storefront URL. */
function pageFor(pathname) {
  const settings = getSettings();
  const r = settings.restaurant;
  const baseTitle = settings.seo.title || `${r.name} | ${r.tagline}`;
  const baseDescription = settings.seo.description || r.description;
  const page = {
    title: baseTitle,
    description: baseDescription,
    canonical: `${config.siteUrl}${pathname === '/' ? '/' : pathname}`,
    image: absolute(r.heroImageUrl || r.logoUrl),
    noindex: false,
    schema: [],
    body: '',
    status: 200,
  };

  if (pathname === '/') {
    const menu = publicMenu();
    const featured = menu.flatMap((c) => c.items).filter((i) => i.featured).slice(0, 8);
    page.schema.push(restaurantSchema(settings));
    page.body = `<main class="prerender"><h1>${esc(r.name)}</h1><p>${esc(r.tagline)}</p><p>${esc(r.description)}</p>
      <p><a href="/menu">View the menu and order online</a></p>
      ${featured.length ? `<h2>Popular dishes</h2><ul>${featured.map((i) => `<li><a href="/menu/${esc(i.slug)}">${esc(i.name)}</a> — ${esc(formatMoney(i.price))}</li>`).join('')}</ul>` : ''}
      <h2>Opening hours</h2>${hoursHtml(settings)}
      <h2>Find us</h2><address>${esc(addressLine(r))}<br>${esc(r.phone)}</address></main>`;
  } else if (pathname === '/menu') {
    const menu = publicMenu();
    page.title = `Menu | ${r.name}`;
    page.description = `Browse the full ${r.name} menu with prices and order online for ${[
      settings.ordering.delivery && 'delivery',
      settings.ordering.pickup && 'pickup',
    ].filter(Boolean).join(' or ') || 'dine-in'} in ${r.city}.`;
    page.schema.push(restaurantSchema(settings, menu));
    page.body = `<main class="prerender"><h1>${esc(r.name)} menu</h1>${menu
      .map(
        (c) => `<section><h2>${esc(c.name)}</h2><ul>${c.items
          .map((i) => `<li><a href="/menu/${esc(i.slug)}">${esc(i.name)}</a> — ${esc(formatMoney(i.price))}${i.description ? `<br>${esc(i.description)}` : ''}</li>`)
          .join('')}</ul></section>`,
      )
      .join('')}</main>`;
  } else if (pathname.startsWith('/menu/')) {
    try {
      const { item } = publicMenuItem(decodeURIComponent(pathname.slice(6)));
      page.title = `${item.name} | ${r.name}`;
      page.description = item.description || `Order ${item.name} from ${r.name} in ${r.city}.`;
      page.image = absolute(item.image_url) || page.image;
      page.schema.push({ '@context': 'https://schema.org', ...menuItemSchema(item, settings.locale.currency) });
      page.body = `<main class="prerender"><h1>${esc(item.name)}</h1><p>${esc(item.description)}</p>
        <p>${esc(formatMoney(item.price))}</p><p><a href="/menu">See the full menu</a></p></main>`;
    } catch {
      page.title = `Dish not found | ${r.name}`;
      page.noindex = true;
      page.status = 404;
    }
  } else {
    // Admin, checkout and tracking pages are private or personal.
    page.noindex = true;
  }
  return page;
}

export function renderIndex(template, pathname) {
  const page = pageFor(pathname);
  const head = [
    `<title data-seo>${esc(page.title)}</title>`,
    `<meta data-seo name="description" content="${esc(page.description)}">`,
    page.noindex ? '<meta data-seo name="robots" content="noindex, nofollow">' : `<link data-seo rel="canonical" href="${esc(page.canonical)}">`,
    `<meta data-seo property="og:type" content="website">`,
    `<meta data-seo property="og:site_name" content="${esc(getSettings().restaurant.name)}">`,
    `<meta data-seo property="og:title" content="${esc(page.title)}">`,
    `<meta data-seo property="og:description" content="${esc(page.description)}">`,
    `<meta data-seo property="og:url" content="${esc(page.canonical)}">`,
    page.image ? `<meta data-seo property="og:image" content="${esc(page.image)}">` : '',
    `<meta data-seo name="twitter:card" content="${page.image ? 'summary_large_image' : 'summary'}">`,
    ...page.schema.map(jsonLd),
    // A data block, not a script: the app reads it on boot so the first paint needs no settings request.
    `<script type="application/json" id="boot-settings">${JSON.stringify(publicSettings()).replace(/</g, '\\u003c')}</script>`,
  ]
    .filter(Boolean)
    .join('\n    ');
  return {
    status: page.status,
    // The template carries a default title between the markers for development; swap the whole block.
    html: template.replace(/<!--app-head-->[\s\S]*?<!--\/app-head-->/, head).replace('<!--app-html-->', page.body),
  };
}

export function robotsTxt() {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api/',
    'Disallow: /checkout',
    'Disallow: /track',
    'Disallow: /payment',
    '',
    `Sitemap: ${config.siteUrl}/sitemap.xml`,
    '',
  ].join('\n');
}

export function sitemapXml() {
  const items = db.all(
    `SELECT m.slug, m.updated_at FROM menu_items m JOIN categories c ON c.id = m.category_id
     WHERE m.archived = 0 AND c.active = 1 ORDER BY m.sort_order, m.name`,
  );
  const lastMenuChange = items.reduce((max, i) => (i.updated_at > max ? i.updated_at : max), '');
  const urls = [
    { loc: '/', lastmod: lastMenuChange, priority: '1.0' },
    { loc: '/menu', lastmod: lastMenuChange, priority: '0.9' },
    ...items.map((i) => ({ loc: `/menu/${i.slug}`, lastmod: i.updated_at, priority: '0.7' })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url><loc>${esc(config.siteUrl + u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod.slice(0, 10)}</lastmod>` : ''}<priority>${u.priority}</priority></url>`,
  )
  .join('\n')}
</urlset>
`;
}
